package com.techzeno.crmtracker.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = BrandNavy,
    onPrimary = CardSurface,
    primaryContainer = BrandBlueSoft,
    onPrimaryContainer = BrandBlue,
    secondary = BrandAqua,
    onSecondary = CardSurface,
    secondaryContainer = SuccessGreenSoft,
    onSecondaryContainer = SuccessGreen,
    tertiary = AccentSlate,
    background = BackgroundSoft,
    onBackground = TextPrimary,
    surface = CardSurface,
    onSurface = TextPrimary,
    surfaceVariant = SurfaceAlt,
    onSurfaceVariant = TextSecondary,
    outline = DividerColor,
    error = AccentCoral,
    onError = CardSurface
)

@Composable
fun CrmCallTrackerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content
    )
}
