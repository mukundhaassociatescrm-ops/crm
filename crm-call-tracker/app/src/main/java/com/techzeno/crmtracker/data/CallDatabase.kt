package com.techzeno.crmtracker.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.techzeno.crmtracker.call.CallEvent

@Database(entities = [CallEvent::class], version = 1)
abstract class CallDatabase : RoomDatabase() {
    abstract fun callDao(): CallDao

    companion object {
        @Volatile
        private var INSTANCE: CallDatabase? = null

        fun getInstance(context: Context): CallDatabase {
            return INSTANCE ?: synchronized(this) {
                val inst = Room.databaseBuilder(
                    context.applicationContext,
                    CallDatabase::class.java,
                    "call_events_db"
                ).build()
                INSTANCE = inst
                inst
            }
        }
    }
}
