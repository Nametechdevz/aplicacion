-- Usuario de base de datos con privilegios mínimos (ejecutar como administrador de MySQL).
-- Reemplace la contraseña por una generada aleatoriamente y guárdela solo en .env.
CREATE DATABASE IF NOT EXISTS js_perfumerias CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'js_pos'@'localhost' IDENTIFIED BY 'CAMBIE_ESTA_CLAVE';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON js_perfumerias.* TO 'js_pos'@'localhost';
-- Nota: la aplicación nunca actualiza ni borra audit_logs. Para reforzarlo a nivel de motor,
-- use privilegios por tabla (otorgue SELECT, INSERT sobre audit_logs y los demás privilegios
-- tabla por tabla) en lugar del GRANT a nivel de base de datos.
FLUSH PRIVILEGES;
