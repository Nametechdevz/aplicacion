package com.webpro.player.ui.login

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.usecase.FieldError
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.message
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.theme.WebProBrushes
import com.webpro.player.ui.theme.WebProColors

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    viewModel: LoginViewModel = viewModel(factory = LoginViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val device = LocalDeviceProfile.current

    LaunchedEffect(state.loggedIn) {
        if (state.loggedIn) {
            viewModel.onNavigated()
            onLoggedIn()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(WebProBrushes.BackgroundGlow)
            .systemBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.Center
    ) {
        if (device.isCompact) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                AppLogo()
                Spacer(Modifier.height(28.dp))
                LoginForm(state, viewModel)
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 48.dp, vertical = 32.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(56.dp)
            ) {
                Column(Modifier.weight(1f)) {
                    AppLogo()
                    Spacer(Modifier.height(28.dp))
                    Text(
                        stringResource(R.string.login_hero_title),
                        style = MaterialTheme.typography.displaySmall
                    )
                    Spacer(Modifier.height(14.dp))
                    Text(
                        stringResource(R.string.login_hero_message),
                        style = MaterialTheme.typography.bodyLarge,
                        color = WebProColors.TextSecondary
                    )
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    LoginForm(state, viewModel)
                }
            }
        }
    }
}

@Composable
private fun LoginForm(state: LoginUiState, viewModel: LoginViewModel) {
    val focusManager = LocalFocusManager.current
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = WebProColors.Surface,
        tonalElevation = 2.dp,
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth()
    ) {
        Column(Modifier.padding(24.dp)) {
            Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = WebProColors.TextSecondary
            )
            Spacer(Modifier.height(20.dp))

            LoginField(
                value = state.server,
                onValueChange = viewModel::onServerChange,
                label = stringResource(R.string.login_server),
                placeholder = stringResource(R.string.login_server_hint),
                icon = Icons.Rounded.Dns,
                error = state.serverError,
                enabled = !state.isLoading,
                keyboardType = KeyboardType.Uri,
                imeAction = ImeAction.Next,
                onImeAction = { focusManager.moveFocus(FocusDirection.Down) }
            )
            Spacer(Modifier.height(12.dp))
            LoginField(
                value = state.username,
                onValueChange = viewModel::onUsernameChange,
                label = stringResource(R.string.login_username),
                placeholder = null,
                icon = Icons.Rounded.Person,
                error = state.usernameError,
                enabled = !state.isLoading,
                keyboardType = KeyboardType.Text,
                imeAction = ImeAction.Next,
                onImeAction = { focusManager.moveFocus(FocusDirection.Down) }
            )
            Spacer(Modifier.height(12.dp))
            LoginField(
                value = state.password,
                onValueChange = viewModel::onPasswordChange,
                label = stringResource(R.string.login_password),
                placeholder = null,
                icon = Icons.Rounded.Lock,
                error = state.passwordError,
                enabled = !state.isLoading,
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
                onImeAction = {
                    focusManager.clearFocus()
                    viewModel.connect()
                },
                visualTransformation = if (state.passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailing = {
                    IconButton(onClick = viewModel::togglePasswordVisibility) {
                        Icon(
                            if (state.passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                            contentDescription = stringResource(
                                if (state.passwordVisible) R.string.login_hide_password else R.string.login_show_password
                            )
                        )
                    }
                }
            )
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier
                    .clip(MaterialTheme.shapes.small)
                    .toggleable(
                        value = state.remember,
                        enabled = !state.isLoading,
                        role = Role.Checkbox,
                        onValueChange = viewModel::onRememberChange
                    )
                    .padding(end = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(checked = state.remember, onCheckedChange = null)
                Text(stringResource(R.string.login_remember), style = MaterialTheme.typography.bodyLarge)
            }

            AnimatedVisibility(visible = state.error != null) {
                val error = state.error
                if (error != null) {
                    Row(
                        modifier = Modifier
                            .padding(top = 12.dp)
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.medium)
                            .background(WebProColors.Error.copy(alpha = 0.12f))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = WebProColors.Error)
                        Spacer(Modifier.width(10.dp))
                        Text(error.message(), style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextPrimary)
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    focusManager.clearFocus()
                    viewModel.connect()
                },
                enabled = !state.isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = MaterialTheme.shapes.medium,
                colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Primary)
            ) {
                if (state.isLoading) {
                    CircularProgressIndicator(
                        color = WebProColors.TextPrimary,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(22.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(stringResource(R.string.login_connecting), fontWeight = FontWeight.Bold)
                } else {
                    Text(stringResource(R.string.login_connect), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(
                stringResource(R.string.login_privacy_note),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextMuted
            )
        }
    }
}

@Composable
private fun LoginField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String?,
    icon: ImageVector,
    error: FieldError?,
    enabled: Boolean,
    keyboardType: KeyboardType,
    imeAction: ImeAction,
    onImeAction: () -> Unit,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (placeholder != null) {
            { Text(placeholder, color = WebProColors.TextMuted) }
        } else null,
        leadingIcon = { Icon(icon, contentDescription = null) },
        trailingIcon = trailing,
        isError = error != null,
        supportingText = if (error != null) {
            { Text(fieldErrorText(error)) }
        } else null,
        singleLine = true,
        enabled = enabled,
        visualTransformation = visualTransformation,
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboardType,
            imeAction = imeAction,
            autoCorrectEnabled = false
        ),
        keyboardActions = KeyboardActions(onAny = { onImeAction() }),
        shape = MaterialTheme.shapes.medium,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = WebProColors.Primary,
            unfocusedBorderColor = WebProColors.Outline
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun fieldErrorText(error: FieldError): String = when (error) {
    FieldError.REQUIRED -> stringResource(R.string.login_error_required)
    FieldError.INVALID_URL -> stringResource(R.string.login_error_invalid_url)
    FieldError.UNSUPPORTED_SCHEME -> stringResource(R.string.login_error_scheme)
}
