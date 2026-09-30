package com.techzeno.crmtracker

import org.junit.Assert.assertEquals
import org.junit.Test

class ContactMatchHelperTest {
    @Test
    fun normalizePhoneNumber_removesFormattingAndCountryCode() {
        assertEquals("9486099644", ContactMatchHelper.normalizePhoneNumber("+91 94860 99644"))
        assertEquals("9486099644", ContactMatchHelper.normalizePhoneNumber("9486099644"))
        assertEquals("9988776655", ContactMatchHelper.normalizePhoneNumber("(998) 877-6655"))
    }
}
