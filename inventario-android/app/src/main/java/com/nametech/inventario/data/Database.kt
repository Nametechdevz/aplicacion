package com.nametech.inventario.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Dao
interface ItemDao {
    @Query("SELECT * FROM items ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<Item>>

    @Query("SELECT * FROM items")
    suspend fun getAll(): List<Item>

    @Query("SELECT * FROM items WHERE id = :id")
    suspend fun get(id: Long): Item?

    @Query("SELECT * FROM items WHERE parentId = :parentId ORDER BY createdAt")
    suspend fun profilesOf(parentId: Long): List<Item>

    @Insert
    suspend fun insert(item: Item): Long

    @Insert
    suspend fun insertAll(items: List<Item>)

    @Update
    suspend fun update(item: Item)

    @Delete
    suspend fun delete(item: Item)

    @Query("DELETE FROM items")
    suspend fun clear()

    @Upsert
    suspend fun upsert(items: List<Item>)

    @Query("DELETE FROM items WHERE id IN (:ids)")
    suspend fun deleteIds(ids: List<Long>)

    @Query("SELECT COUNT(*) FROM items")
    suspend fun count(): Int
}

@Dao
interface ClientDao {
    @Query("SELECT * FROM clients ORDER BY name COLLATE NOCASE")
    fun observeAll(): Flow<List<Client>>

    @Query("SELECT * FROM clients")
    suspend fun getAll(): List<Client>

    @Query("SELECT * FROM clients WHERE id = :id")
    suspend fun get(id: Long): Client?

    @Insert
    suspend fun insert(client: Client): Long

    @Insert
    suspend fun insertAll(clients: List<Client>)

    @Update
    suspend fun update(client: Client)

    @Delete
    suspend fun delete(client: Client)

    @Query("DELETE FROM clients")
    suspend fun clear()

    @Upsert
    suspend fun upsert(clients: List<Client>)

    @Query("DELETE FROM clients WHERE id IN (:ids)")
    suspend fun deleteIds(ids: List<Long>)
}

@Dao
interface SaleDao {
    @Query("SELECT * FROM sales ORDER BY date DESC, createdAt DESC")
    fun observeAll(): Flow<List<Sale>>

    @Query("SELECT * FROM sales")
    suspend fun getAll(): List<Sale>

    @Insert
    suspend fun insert(sale: Sale): Long

    @Insert
    suspend fun insertAll(sales: List<Sale>)

    @Delete
    suspend fun delete(sale: Sale)

    @Query("UPDATE sales SET itemId = NULL WHERE itemId = :itemId")
    suspend fun detachItem(itemId: Long)

    @Query("UPDATE sales SET clientId = NULL WHERE clientId = :clientId")
    suspend fun detachClient(clientId: Long)

    @Query("DELETE FROM sales")
    suspend fun clear()

    @Upsert
    suspend fun upsert(sales: List<Sale>)

    @Query("DELETE FROM sales WHERE id IN (:ids)")
    suspend fun deleteIds(ids: List<Long>)
}

@Database(entities = [Item::class, Client::class, Sale::class], version = 3, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun items(): ItemDao
    abstract fun clients(): ClientDao
    abstract fun sales(): SaleDao

    companion object {
        fun build(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "inventario.db")
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()

        /** v2: cuentas completas con perfiles. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'SINGLE'")
                db.execSQL("ALTER TABLE items ADD COLUMN parentId INTEGER DEFAULT NULL")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_items_parentId ON items(parentId)")
            }
        }

        /** v3: sincronización con servidor (revisiones y vendedor de cada venta). */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE items ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE clients ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE sales ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE sales ADD COLUMN createdBy TEXT NOT NULL DEFAULT ''")
            }
        }
    }
}
