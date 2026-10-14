# Migraciones

`database/schema.sql` contiene el esquema completo de la versión 1.0 y es idempotente
(`CREATE TABLE IF NOT EXISTS`).

Cuando una versión futura necesite cambiar la estructura de una base de datos ya instalada,
el cambio se agregará aquí como un archivo numerado, por ejemplo:

```
2026_11_01_001_agregar_tabla_cupones.sql
```

Aplique los archivos en orden con phpMyAdmin o con
`mysql -u USUARIO -p NOMBRE_BD < database/migrations/ARCHIVO.sql`, siempre después de hacer
una copia de seguridad. Por ahora no hay migraciones pendientes.
