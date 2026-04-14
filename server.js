require("dotenv").config();

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log(" NUEVA VERSION BACKEND ");
console.log("INICIANDO SERVIDOR...");
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");



const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.log("❌ Error SMTP:", error);
    } else {
        console.log("✅ SMTP listo");
    }
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));


// login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    db.query(
        "SELECT * FROM usuarios WHERE BINARY username = ?",
        [username],
        async (err, result) => {

            if (err) {
                console.error("Error en login:", err);
                return res.status(500).json({ success: false, mensaje: "Error del servidor" });
            }




            // Usuario no existe
            if (result.length === 0) {
                return res.json({
                    success: false,
                    mensaje: "Usuario  o contraseña incorrecto"
                });
            }
            // Usuario desactivado
            const user = result[0];

            if (user.activo == 0) {
                return res.json({
                    success: false,
                    mensaje: "Usuario desactivado"
                });
            }

            try {
                // SOLO bcrypt 
                const match = await bcrypt.compare(password, user.password);

                // Contraseña incorrecta
                if (!match) {
                    return res.json({
                        success: false,
                        mensaje: "Contraseña incorrecta"
                    });
                }
                // Login exitoso
                res.json({
                    success: true,
                    usuario: user.username,
                    rol: user.rol
                });

            } catch (error) {
                console.error("Error en bcrypt:", error);
                return res.status(500).json({
                    success: false,
                    mensaje: "Error validando contraseña"
                });
            }
        }
    );
});

//  conexión a MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect(err => {
    if (err) {
        console.log("Error conexión:", err);
    } else {
        console.log("Conectado a MySQL ✅");
    }
});


// OBTENER LOTES
app.get("/lotes", (req, res) => {
    db.query("SELECT * FROM lotes WHERE eliminado = 0", (err, result) => {
        if (err) {
            console.error("Error obteniendo lotes:", err);
            return res.status(500).json({ error: "Error en la base de datos" });
        }

        res.json(result);
    });
});

//  OBTENER EVENTOS
app.get("/eventos", (req, res) => {
    db.query(`
        SELECT e.*, l.numero 
       FROM eventos e
       JOIN lotes l ON e.lote_id = l.id
       WHERE e.eliminado = 0
    `, (err, result) => {
        if (err) {
            console.error("Error obteniendo eventos:", err);
            return res.status(500).json({ error: "Error en la base de datos" });
        }

        res.json(result);
    });
});

//  CREAR LOTE
app.post("/lotes", (req, res) => {
    const { numero, producto, fecha_fabricacion, fecha_vencimiento, cantidad, proveedor, observaciones } = req.body;

    db.query(
        "INSERT INTO lotes (numero, producto, fecha_fabricacion, fecha_vencimiento, cantidad, proveedor,observaciones) VALUES (?, ?, ?, ?, ?, ?,?)",
        [numero, producto, fecha_fabricacion, fecha_vencimiento, cantidad, proveedor, observaciones],
        (err, result) => {
            if (err) return res.json(err);
            res.json({ mensaje: "Lote creado" });
        }
    );
});

//  CREAR EVENTO
app.post("/eventos", (req, res) => {
    const { codigo, lote_id, tipo, descripcion, fecha, gravedad } = req.body;

    const hoy = new Date().toISOString().split("T")[0];

    if (fecha > hoy) {
        return res.status(400).json({
            error: "No se permiten fechas futuras"
        });
    }

    db.query(
        "INSERT INTO eventos (codigo, lote_id, tipo, descripcion, fecha, gravedad) VALUES (?, ?, ?, ?, ?, ?)",
        [codigo, lote_id, tipo, descripcion, fecha, gravedad],
        (err, result) => {
            if (err) return res.json(err);
            res.json({ mensaje: "Evento creado" });
        }
    );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor corriendo en puerto", PORT);
});


// ===============================
// OBTENER LOTE POR ID
// ===============================
app.get("/lotes/:id", (req, res) => {
    const id = req.params.id;

    const sql = "SELECT * FROM lotes WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error en MySQL:", err);
            return res.status(500).json({ error: "Error en la base de datos" });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: "Lote no encontrado" });
        }

        res.json(result[0]);
    });
});

// Marcar como resuelto
app.put("/eventos/resolver/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "UPDATE eventos SET estado = 'Resuelto' WHERE id = ?",
        [id],
        (err, result) => {
            if (err) return res.json(err);
            res.json({ mensaje: "Evento resuelto" });
        }
    );
});


// MARCAR COMO EN INVESTIGACIÓN
app.put("/eventos/investigar/:id", (req, res) => {
    const id = req.params.id;

    console.log("Investigando evento ID:", id); //  AGREGA ESTO

    db.query(
        "UPDATE eventos SET estado = 'En investigación' WHERE id = ?",
        [id],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }

            res.json({ mensaje: "Evento en investigación" });
        }
    );
});

// ELIMINAR EVENTO
// ===============================
app.delete("/lotes/:id", (req, res) => {

    //  OBTENER ROL DESDE HEADERS
    const rol = req.headers.rol;

    if (!rol) {
        return res.status(400).json({ error: "Rol no enviado" });
    }

    //  BLOQUEAR ASISTENTE
    if (rol === "asistente") {
        return res.status(403).json({ error: "No autorizado" });
    }
    const id = req.params.id;

    // marcar eventos como eliminados
    db.query("UPDATE eventos SET eliminado = 1 WHERE lote_id = ?", [id], (err) => {
        if (err) return res.status(500).json(err);

        // marcar lote como eliminado
        db.query(
            "UPDATE lotes SET eliminado = 1 WHERE id = ?",
            [id],
            (err2) => {
                if (err2) return res.status(500).json(err2);

                res.json({ mensaje: "Lote eliminado (oculto)" });
            }
        );
    });
});

//EVENTOS DELETE
app.delete("/eventos/:id", (req, res) => {

    const rol = req.headers.rol;

    if (!rol) {
        return res.status(400).json({ error: "Rol no enviado" });
    }

    // BLOQUEAR ASISTENTE
    if (rol === "asistente") {
        return res.status(403).json({ error: "No autorizado" });
    }

    const id = req.params.id;

    db.query(
        "UPDATE eventos SET eliminado = 1 WHERE id = ?",
        [id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ mensaje: "Evento eliminado correctamente" });
        }
    );
});


// BUSCAR LOTE POR NUMERO
app.get("/lotes/buscar/:numero", (req, res) => {
    const numero = req.params.numero;

    db.query(
        "SELECT * FROM lotes WHERE numero = ?",
        [numero],
        (err, result) => {
            if (err) return res.status(500).json(err);

            if (result.length === 0) {
                return res.status(404).json({ error: "No encontrado" });
            }

            res.json(result[0]);
        }
    );
});

// ===============================
// GENERAR REPORTES
// ===============================
app.get("/reporte/:tipo", (req, res) => {
    const tipo = req.params.tipo;

    if (tipo === "lotes-activos") {
        db.query(
            "SELECT * FROM lotes WHERE estado IS NULL OR estado = 'Activo'",
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }

    else if (tipo === "lotes-retirados") {
        db.query(
            `SELECT 
            l.numero,
            l.producto,
            l.fecha_fabricacion,
            e.descripcion AS motivo_retiro
         FROM lotes l
         LEFT JOIN eventos e ON l.id = e.lote_id
         WHERE l.estado = 'Retirado'`,
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }
    else if (tipo === "eventos-periodo") {
        const { inicio, fin } = req.query;

        if (!inicio || !fin) {
            return res.status(400).json({ error: "Faltan fechas" });
        }
        db.query(
            `SELECT e.*, l.producto, l.numero, l.estado AS lote_estado, l.eliminado AS lote_eliminado
                         FROM eventos e
                         JOIN lotes l ON e.lote_id = l.id
                         WHERE e.fecha BETWEEN ? AND ?`,
            [inicio, fin],
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }

    //  PRODUCTOS POR PROVEEDOR
    else if (tipo === "productos") {
        db.query(
            `SELECT proveedor, producto, COUNT(*) as total
             FROM lotes
             GROUP BY proveedor, producto`,
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }

    else if (tipo === "eventos-investigacion") {
        db.query(
            "SELECT * FROM eventos WHERE estado = 'En investigación'",
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }
    // EVENTOS PENDIENTES
    else if (tipo === "eventos-pendientes") {
        db.query(
            "SELECT * FROM eventos WHERE estado IS NULL OR estado = 'Pendiente'",
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }

    // EVENTOS RESUELTOS
    else if (tipo === "eventos-resueltos") {
        db.query(
            "SELECT * FROM eventos WHERE estado = 'Resuelto'",
            (err, result) => {
                if (err) return res.status(500).json(err);
                res.json(result);
            }
        );
    }

    else {
        res.status(400).json({ error: "Tipo de reporte inválido" });
    }
});


// RETIRAR LOTE (NO ELIMINAR)
app.put("/lotes/retirar/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "UPDATE lotes SET estado = 'Retirado' WHERE id = ?",
        [id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ mensaje: "Lote retirado correctamente" });
        }
    );
});


// ACTUALIZAR LOTE
app.put("/lotes/:id", (req, res) => {
    const id = req.params.id;
    const { producto, fecha_fabricacion, fecha_vencimiento, cantidad, proveedor, observaciones } = req.body;

    const usuario = req.body.usuario || "Sistema";

    db.query("SELECT * FROM lotes WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json(err);

        // DETECTAR CAMBIOS
        const lote = result[0];

        if (!lote) {
            return res.status(404).json({ error: "Lote no encontrado" });
        }

        const cambios = [];

        if (lote.producto !== producto) {
            cambios.push(["producto", lote.producto, producto]);
        }

        if (new Date(lote.fecha_fabricacion).toISOString().split("T")[0] !== fecha_fabricacion) {
            cambios.push(["fecha_fabricacion", lote.fecha_fabricacion, fecha_fabricacion]);
        }

        if (new Date(lote.fecha_vencimiento).toISOString().split("T")[0] !== fecha_vencimiento) {
            cambios.push(["fecha_vencimiento", lote.fecha_vencimiento, fecha_vencimiento]);
        }

        if (lote.cantidad != cantidad) {
            cambios.push(["cantidad", lote.cantidad, cantidad]);
        }

        if (lote.proveedor !== proveedor) {
            cambios.push(["proveedor", lote.proveedor, proveedor]);
        }

        if (lote.observaciones !== observaciones) {
            cambios.push(["observaciones", lote.observaciones, observaciones]);
        }
        // historial
        console.log("CAMBIOS LOTE:", cambios);

        // GUARDAR HISTORIAL
        if (cambios.length > 0) {
            const valores = cambios.map(c => [id, c[0], c[1], c[2], usuario]);

            db.query(
                "INSERT INTO lotes_historial (lote_id, campo, valor_anterior, valor_nuevo, usuario) VALUES ?",
                [valores],
                (errHist) => {
                    if (errHist) console.error(errHist);
                }
            );
        }

        // ACTUALIZAR
        db.query(
            `UPDATE lotes 
             SET producto=?, fecha_fabricacion=?, fecha_vencimiento=?, cantidad=?, proveedor=?, observaciones=? 
             WHERE id=?`,
            [producto, fecha_fabricacion, fecha_vencimiento, cantidad, proveedor, observaciones, id],
            (err2) => {
                if (err2) return res.status(500).json(err2);

                res.json({ mensaje: "Lote actualizado con historial ✅" });
            }
        );
    });
});

// ===============================
// ACTUALIZAR EVENTO + HISTORIAL 
// ===============================
app.put("/eventos/:id", (req, res) => {
    const id = req.params.id;
    const { tipo, descripcion, gravedad, usuario } = req.body;

    db.query("SELECT * FROM eventos WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length === 0) {
            return res.status(404).json({ error: "Evento no encontrado" });
        }

        const evento = result[0];

        if (evento.eliminado == 1) {
            return res.status(400).json({
                error: "No se puede editar un evento eliminado"
            });
        }


        // DETECTAR CAMBIOS

        const cambios = [];

        if (evento.tipo !== tipo) {
            cambios.push(["tipo", evento.tipo, tipo]);
        }

        if (evento.descripcion !== descripcion) {
            cambios.push(["descripcion", evento.descripcion, descripcion]);
        }

        if (evento.gravedad !== gravedad) {
            cambios.push(["gravedad", evento.gravedad, gravedad]);
        }


        //  GUARDAR HISTORIAL

        if (cambios.length > 0) {
            const valores = cambios.map(c => [id, c[0], c[1], c[2], usuario]);

            db.query(
                "INSERT INTO eventos_historial (evento_id, campo, valor_anterior, valor_nuevo, usuario) VALUES ?",
                [valores],
                (errHist) => {
                    if (errHist) {
                        console.error("Error guardando historial:", errHist);
                    }
                }
            );
        }


        // ACTUALIZAR EVENTO

        db.query(
            `UPDATE eventos 
             SET tipo = ?, descripcion = ?, gravedad = ?
             WHERE id = ?`,
            [tipo, descripcion, gravedad, id],
            (err2) => {
                if (err2) return res.status(500).json(err2);

                res.json({ mensaje: "Evento actualizado con historial ✅" });
            }
        );
    });
});

// ===============================
// OBTENER HISTORIAL EVENTO
// ===============================
app.get("/eventos/historial/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "SELECT * FROM eventos_historial WHERE evento_id = ? ORDER BY fecha DESC",
        [id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        }
    );
});


// ===============================
// OBTENER HISTORIAL LOTE
// ===============================
app.get("/lotes/historial/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "SELECT * FROM lotes_historial WHERE lote_id = ? ORDER BY fecha DESC",
        [id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        }
    );
});


// HISTORIAL DE LOTES CON NUMERO Y PRODUCTO
app.get("/historial/lotes", (req, res) => {
    db.query(`
        SELECT 
            h.campo,
            h.valor_anterior,
            h.valor_nuevo,
            h.usuario,
            h.fecha,
            l.numero,
            l.producto
        FROM lotes_historial h
        JOIN lotes l ON h.lote_id = l.id
        ORDER BY h.fecha DESC
    `, (err, result) => {
        if (err) {
            console.error("Error historial lotes:", err);
            return res.status(500).json(err);
        }
        res.json(result);
    });
});

// HISTORIAL DE EVENTOS CON CODIGO Y PRODUCTO
app.get("/historial/eventos", (req, res) => {
    db.query(`
        SELECT 
            h.campo,
            h.valor_anterior,
            h.valor_nuevo,
            h.usuario,
            h.fecha,
            e.codigo,
            l.numero,
            l.producto
        FROM eventos_historial h
        JOIN eventos e ON h.evento_id = e.id
        JOIN lotes l ON e.lote_id = l.id
        ORDER BY h.fecha DESC
    `, (err, result) => {
        if (err) {
            console.error("Error historial eventos:", err);
            return res.status(500).json(err);
        }
        res.json(result);
    });
});


// ===============================
// CREAR USUARIO
// ===============================
app.post("/usuarios", async (req, res) => {
    const { username, email, nombre, rol, password, activo } = req.body;

    if (!username || !password || !rol) {
        return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    try {
        //  ENCRIPTAR CONTRASEÑA AQUÍ
        const hash = await bcrypt.hash(password, 10);

        db.query(
            "INSERT INTO usuarios (username, email, nombre, rol, password, activo) VALUES (?, ?, ?, ?, ?, ?)",
            [username, email, nombre, rol, hash, activo ? 1 : 0],
            (err, result) => {

                if (err) {
                    console.error("Error creando usuario:", err);
                    return res.status(500).json({ error: "Error en base de datos" });
                }

                res.json({ mensaje: "Usuario creado correctamente 🔐" });
            }
        );

    } catch (error) {
        console.error("Error bcrypt:", error);
        res.status(500).json({ error: "Error encriptando contraseña" });
    }
});

// ===============================
// ACTIVAR / DESACTIVAR USUARIO
// ===============================
app.put("/usuarios/estado/:id", (req, res) => {
    const id = req.params.id;
    const { activo } = req.body; // 1 o 0

    if (activo !== 0 && activo !== 1) {
        return res.status(400).json({ error: "Valor inválido" });
    }

    db.query(
        "UPDATE usuarios SET activo = ? WHERE id = ?",
        [activo, id],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }

            res.json({
                mensaje: activo === 1
                    ? "Usuario activado ✅"
                    : "Usuario desactivado ❌"
            });
        }
    );
});

// ===============================
// LISTAR USUARIOS
// ===============================
app.get("/usuarios", (req, res) => {
    db.query("SELECT * FROM usuarios", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

// ===============================
// Validad inicio de seccion
// ===============================
app.get("/validar-sesion", (req, res) => {
    const usuario = req.headers.usuario;

    db.query(
        "SELECT activo FROM usuarios WHERE username = ?",
        [usuario],
        (err, result) => {
            if (err) return res.status(500).json(err);

            if (result.length === 0) {
                return res.json({ activo: false });
            }

            res.json({ activo: result[0].activo === 1 });
        }
    );
});


// ===============================
// ELIMINAR USUARIO
// ===============================
app.delete("/usuarios/:id", (req, res) => {
    const id = req.params.id;
    const rolSolicitante = req.headers.rol;

    // 🔒 Solo admin puede eliminar
    if (rolSolicitante !== "admin") {
        return res.status(403).json({ error: "No autorizado" });
    }

    //  Verificar rol del usuario a eliminar
    db.query(
        "SELECT rol FROM usuarios WHERE id = ?",
        [id],
        (err, result) => {

            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }

            if (result.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado" });
            }

            const rolUsuario = result[0].rol;

            // BLOQUEAR SI ES ADMIN
            if (rolUsuario === "admin") {
                return res.status(403).json({
                    error: "No se puede eliminar un usuario administrador ❌"
                });
            }

            //  SI NO ES ADMIN → eliminar
            db.query(
                "DELETE FROM usuarios WHERE id = ?",
                [id],
                (err2) => {
                    if (err2) return res.status(500).json(err2);

                    res.json({ mensaje: "Usuario eliminado correctamente ✅" });
                }
            );
        }
    );
});
// ===============================
// Enviar correo
// ===============================
app.post("/recuperar-password", (req, res) => {
    const { username, email } = req.body;

    // Validación básica
    if (!username || !email) {
        return res.status(400).json({
            mensaje: "Usuario y correo son obligatorios ❌"
        });
    }

    // Buscar usuario con ese username Y email
    db.query(
        "SELECT * FROM usuarios WHERE username = ? AND email = ?",
        [username, email],
        (err, result) => {

            if (err) {
                console.error("Error en recuperación:", err);
                return res.status(500).json({
                    mensaje: "Error del servidor"
                });
            }

            //  No coincide usuario + correo
            if (result.length === 0) {
                return res.json({
                    mensaje: "Usuario o correo incorrecto ❌"
                });
            }

            const user = result[0];

            //  Generar token
            const token = crypto.randomBytes(32).toString("hex");

            // Guardar token en BD
            db.query(
                "UPDATE usuarios SET reset_token = ?, reset_expira = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?",
                [token, user.id],
                (err2) => {
                    if (err2) {
                        console.error("Error guardando token:", err2);
                        return res.status(500).json({
                            mensaje: "Error generando recuperación"
                        });
                    }

                    //  Link de recuperación
                    const link = `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${token}`;

                    // 📩 Enviar correo
                    transporter.sendMail({
                        from: "Sistema Marmotech<carlosdavidcuevas9810@gmail.com>",
                        to: user.email,
                        subject: "Recuperación de contraseña",
                        html: `
                            <h3>Recuperar contraseña</h3>
                            <p>Hola ${user.username},</p>
                            <p>Haz clic en el siguiente enlace:</p>
                            <a href="${link}">Restablecer contraseña</a>
                            <p>Este enlace expira en 15 minutos.</p>
                        `
                    }, (error, info) => {
                        if (error) {
                            console.error("Error enviando correo:", error);
                            return res.status(500).json({
                                mensaje: "Error enviando correo ❌"
                            });
                        }

                        res.json({
                            mensaje: "Correo enviado correctamente 📩"
                        });
                    });
                }
            );
        }
    );
});


// ===============================
// Cambiar contraseña
// ===============================
app.post("/reset-password", async (req, res) => {
    const { token, nuevaPassword } = req.body;

    db.query(
        "SELECT * FROM usuarios WHERE reset_token = ? AND reset_expira > NOW()",
        [token],
        async (err, result) => {

            if (result.length === 0) {
                return res.json({ success: false, mensaje: "Token inválido o expirado" });
            }

            const hash = await bcrypt.hash(nuevaPassword, 10);

            db.query(
                "UPDATE usuarios SET password = ?, reset_token = NULL, reset_expira = NULL WHERE id = ?",
                [hash, result[0].id]
            );

            res.json({ success: true, mensaje: "Contraseña actualizada ✅" });
        }
    );
});

//Obtener configuración
// ===============================
app.get("/configuracion", (req, res) => {
    db.query("SELECT * FROM configuracion LIMIT 1", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result[0]);
    });
});


//Guardar configuración
// ===============================
app.put("/configuracion", (req, res) => {
    const { notificaciones, dias_alerta } = req.body;

    db.query(
        "UPDATE configuracion SET notificaciones = ?, dias_alerta = ? WHERE id = 1",
        [notificaciones, dias_alerta],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ mensaje: "Configuración guardada ✅" });
        }
    );
});


//Alertas
// ===============================
app.get("/alertas", (req, res) => {
    const hoy = new Date();

    db.query("SELECT * FROM configuracion LIMIT 1", (err, configResult) => {
        if (err) return res.status(500).json(err);

        const dias = configResult[0].dias_alerta;

        db.query("SELECT * FROM lotes WHERE eliminado = 0", (err2, lotes) => {
            if (err2) return res.status(500).json(err2);

            const alertas = lotes.filter(l => {
                const vencimiento = new Date(l.fecha_vencimiento);
                const diferencia = (vencimiento - hoy) / (1000 * 60 * 60 * 24);
                return diferencia <= dias;
            });

            res.json(alertas);
        });
    });
});

// ===============================
// EDITAR USUARIO
// ===============================
app.put("/usuarios/:id", (req, res) => {
    const id = req.params.id;
    const { username, email, nombre, rol, activo } = req.body;
    const rolSolicitante = req.headers.rol;

    //  Solo admin puede editar
    if (rolSolicitante !== "admin") {
        return res.status(403).json({ error: "No autorizado" });
    }

    // Validación básica
    if (!username || !rol) {
        return res.status(400).json({ error: "Datos obligatorios faltantes" });
    }

    //  Evitar modificar a otro admin (opcional)
    db.query("SELECT rol FROM usuarios WHERE id = ?", [id], (err, result) => {
        if (err) return res.status(500).json(err);

        if (result.length === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        if (result[0].rol === "admin") {
            return res.status(403).json({
                error: "No se puede modificar un administrador ❌"
            });
        }

        //  Actualizar usuario
        db.query(
            "UPDATE usuarios SET username=?, email=?, nombre=?, rol=?, activo=? WHERE id=?",
            [username, email, nombre, rol, activo ? 1 : 0, id],
            (err2) => {
                if (err2) return res.status(500).json(err2);

                res.json({ mensaje: "Usuario actualizado correctamente ✅" });
            }
        );
    });
});