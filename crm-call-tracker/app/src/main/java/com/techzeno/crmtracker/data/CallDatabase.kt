package com.techzeno.crmtracker.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.techzeno.crmtracker.call.CallEvent

@Database(entities = [CallEvent::class, CallTaskLink::class], version = 3)
abstract class CallDatabase : RoomDatabase() {
    abstract fun callDao(): CallDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS call_task_links (callId INTEGER NOT NULL, taskId TEXT NOT NULL, displayId TEXT NOT NULL, PRIMARY KEY(callId, taskId))")
            }
        }

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE call_events ADD COLUMN sourceCallId INTEGER")
                db.execSQL("CREATE UNIQUE INDEX index_call_events_sourceCallId ON call_events(sourceCallId)")
            }
        }

        @Volatile
        private var INSTANCE: CallDatabase? = null

        fun getInstance(context: Context): CallDatabase {
            return INSTANCE ?: synchronized(this) {
                val inst = Room.databaseBuilder(
                    context.applicationContext,
                    CallDatabase::class.java,
                    "call_events_db"
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build()
                INSTANCE = inst
                inst
            }
        }
    }
}
