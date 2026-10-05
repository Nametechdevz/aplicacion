package com.webpro.player.desktop.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.Screen
import com.webpro.player.desktop.ui.rememberScreenModel
import com.webpro.player.domain.usecase.FieldError
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.theme.WebProBrushes
import com.webpro.player.ui.theme.WebProColors

@Composable
fun LoginScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val model = rememberScreenModel { LoginModel(container) { navigator.replaceAll(Screen.Main) } }
    val state by model.state.collectAsState()
    val focus = LocalFocusManager.current

    Box(Modifier.fillMaxSize().background(WebProBrushes.BackgroundGlow), contentAlignment = Alignment.Center) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 64.dp, vertical = 40.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(64.dp)
        ) {
            Column(Modifier.weight(1f)) {
                AppLogo()
                Spacer(Modifier.height(28.dp))
                Text(S.LOGIN_HERO_TITLE, style = MaterialTheme.typography.displaySmall)
                Spacer(Modifier.height(14.dp))
                Text(S.LOGIN_HERO_MESSAGE, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary)
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = WebProColors.Surface,
                    modifier = Modifier.widthIn(max = 500.dp).fillMaxWidth()
                ) {
                    Column(
                        Modifier.padding(28.dp).onPreviewKeyEvent { e ->
                            if (e.type == KeyEventType.KeyDown && (e.key == Key.Enter || e.key == Key.NumPadEnter)) {
                                model.connect(); true
                            } else false
                        }
                    ) {
                        Text(S.LOGIN_TITLE, style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(4.dp))
                        Text(S.LOGIN_SUBTITLE, style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextSecondary)
                        Spacer(Modifier.height(20.dp))
                        LoginField(state.server, model::onServer, S.LOGIN_SERVER, S.LOGIN_SERVER_HINT, Icons.Rounded.Dns, state.serverError,
                            !state.isLoading, KeyboardType.Uri) { focus.moveFocus(FocusDirection.Down) }
                        Spacer(Modifier.height(12.dp))
                        LoginField(state.username, model::onUser, S.LOGIN_USER, null, Icons.Rounded.Person, state.usernameError,
                            !state.isLoading, KeyboardType.Text) { focus.moveFocus(FocusDirection.Down) }
                        Spacer(Modifier.height(12.dp))
                        LoginField(
                            state.password, model::onPassword, S.LOGIN_PASSWORD, null, Icons.Rounded.Lock, state.passwordError,
                            !state.isLoading, KeyboardType.Password,
                            visual = if (state.passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                            trailing = {
                                IconButton(onClick = model::togglePassword) {
                                    Icon(if (state.passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, null)
                                }
                            }
                        ) { model.connect() }
                        Spacer(Modifier.height(10.dp))
                        Row(
                            Modifier.clip(MaterialTheme.shapes.small)
                                .toggleable(state.remember, enabled = !state.isLoading, role = Role.Checkbox, onValueChange = model::onRemember)
                                .padding(end = 12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(checked = state.remember, onCheckedChange = null)
                            Text(S.LOGIN_REMEMBER, style = MaterialTheme.typography.bodyLarge)
                        }
                        AnimatedVisibility(state.error != null) {
                            val error = state.error
                            if (error != null) {
                                Row(
                                    Modifier.padding(top = 12.dp).fillMaxWidth().clip(MaterialTheme.shapes.medium)
                                        .background(WebProColors.Error.copy(alpha = 0.12f)).padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Rounded.ErrorOutline, null, tint = WebProColors.Error)
                                    Spacer(Modifier.width(10.dp))
                                    Text(S.error(error), style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                        Spacer(Modifier.height(20.dp))
                        Button(
                            onClick = model::connect,
                            enabled = !state.isLoading,
                            modifier = Modifier.fillMaxWidth().height(54.dp),
                            shape = MaterialTheme.shapes.medium,
                            colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Primary)
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(color = WebProColors.TextPrimary, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
                                Spacer(Modifier.width(12.dp))
                                Text(S.LOGIN_CONNECTING, fontWeight = FontWeight.Bold)
                            } else Text(S.LOGIN_CONNECT, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(S.LOGIN_PRIVACY, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextMuted)
                    }
                }
            }
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    placeholder: String?,
    icon: ImageVector,
    error: FieldError?,
    enabled: Boolean,
    keyboardType: KeyboardType,
    visual: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null,
    onDone: () -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = if (placeholder != null) {
            { Text(placeholder, color = WebProColors.TextMuted) }
        } else null,
        leadingIcon = { Icon(icon, null) },
        trailingIcon = trailing,
        isError = error != null,
        supportingText = if (error != null) {
            {
                Text(
                    when (error) {
                        FieldError.REQUIRED -> S.FIELD_REQUIRED
                        FieldError.INVALID_URL -> S.FIELD_INVALID_URL
                        FieldError.UNSUPPORTED_SCHEME -> S.FIELD_SCHEME
                    }
                )
            }
        } else null,
        singleLine = true,
        enabled = enabled,
        visualTransformation = visual,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = ImeAction.Next, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onAny = { onDone() }),
        shape = MaterialTheme.shapes.medium,
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = WebProColors.Primary, unfocusedBorderColor = WebProColors.Outline),
        modifier = Modifier.fillMaxWidth()
    )
}
