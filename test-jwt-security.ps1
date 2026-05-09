# ================================================================
# SCRIPT DE TESTING — JWT SECURITY FIX
# Belleza Integral — Validación de corrección de seguridad
# ================================================================

Write-Host "🔒 TESTING JWT SECURITY FIX" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Variables
$API_URL = "https://liz-belleza.newtraderchiles.workers.dev"
$RESERVAS_ENDPOINT = "$API_URL/api/cliente/reservas"

# ================================================================
# TEST 1: Token Válido Debe Ser Aceptado (200 OK)
# ================================================================

Write-Host "TEST 1: Token Válido Debe Ser Aceptado" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

Write-Host "`nPASO 1: Obtener un token válido de Supabase"
Write-Host "  a) Abre https://liz-belleza.newtraderchiles.workers.dev/cliente.html"
Write-Host "  b) Haz click en 'Iniciar sesión con Google'"
Write-Host "  c) Después de autenticarte, abre DevTools (F12)"
Write-Host "  d) Ve a Application → Cookies → liz-belleza.newtraderchiles.workers.dev"
Write-Host "  e) O usa: sessionStorage.getItem('sb-dkryjxgjqmikrhusxsau-auth-token')"
Write-Host ""

$validToken = Read-Host "Pega aquí tu token válido de Supabase (o presiona Enter para saltar)"

if ($validToken) {
    Write-Host "`nPASO 2: Enviar request con token válido..." -ForegroundColor Green

    $headers = @{
        "Authorization" = "Bearer $validToken"
        "Content-Type"  = "application/json"
    }

    try {
        $response = Invoke-WebRequest -Uri $RESERVAS_ENDPOINT `
                                     -Headers $headers `
                                     -Method Get `
                                     -SkipHttpErrorCheck

        if ($response.StatusCode -eq 200) {
            Write-Host "✅ TEST 1 PASÓ: 200 OK" -ForegroundColor Green
            Write-Host "   Respuesta:" -ForegroundColor Green
            $jsonResponse = $response.Content | ConvertFrom-Json
            Write-Host "   - Reservas encontradas: $(($jsonResponse.reservas | Measure-Object).Count)" -ForegroundColor Green
            Write-Host "   - Primer usuario: $($jsonResponse.reservas[0].nombre)" -ForegroundColor Green
        } else {
            Write-Host "❌ TEST 1 FALLÓ: Status $($response.StatusCode)" -ForegroundColor Red
            Write-Host "   Respuesta: $($response.Content)" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ ERROR en TEST 1: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⏭️  TEST 1 SALTADO (sin token proporcionado)" -ForegroundColor Gray
}

# ================================================================
# TEST 2: Token Falso Debe Ser Rechazado (401 Unauthorized)
# ================================================================

Write-Host "`n`nTEST 2: Token Falso Debe Ser Rechazado" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

Write-Host "`nCreando JWT falso con payload malicioso..." -ForegroundColor Green

# Crear payload falso
$fakePayload = @{
    email = "hacker@evil.com"
    sub   = "fake_user_id"
    exp   = [int](([DateTime]::UtcNow.AddYears(1) - [DateTime]::UnixEpoch).TotalSeconds)
} | ConvertTo-Json

# Encoding base64 (base64url para JWT)
$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($fakePayload)
$payloadBase64 = [Convert]::ToBase64String($payloadBytes) -replace '\+','-' -replace '/','_' -replace '=',''

# JWT falso: header.fakePayload.fakesignature
$fakeJWT = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.$payloadBase64.fakesignaturethatdoesntmatch"

Write-Host "JWT Falso Creado:" -ForegroundColor Gray
Write-Host "  Header: eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9" -ForegroundColor Gray
Write-Host "  Payload: $payloadBase64" -ForegroundColor Gray
Write-Host "  Signature: fakesignaturethatdoesntmatch" -ForegroundColor Gray
Write-Host ""

Write-Host "PASO 1: Enviar request con token falso..." -ForegroundColor Green

$fakeHeaders = @{
    "Authorization" = "Bearer $fakeJWT"
    "Content-Type"  = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri $RESERVAS_ENDPOINT `
                                 -Headers $fakeHeaders `
                                 -Method Get `
                                 -SkipHttpErrorCheck

    if ($response.StatusCode -eq 401) {
        Write-Host "✅ TEST 2 PASÓ: 401 Unauthorized (Token rechazado)" -ForegroundColor Green
        Write-Host "   Respuesta esperada: 'No autorizado'" -ForegroundColor Green
    } elseif ($response.StatusCode -eq 200) {
        Write-Host "❌ TEST 2 FALLÓ: Token falso fue ACEPTADO (🔴 CRÍTICO)" -ForegroundColor Red
        Write-Host "   La validación de JWT no está funcionando correctamente" -ForegroundColor Red
    } else {
        Write-Host "⚠️  TEST 2: Status inesperado $($response.StatusCode)" -ForegroundColor Yellow
        Write-Host "   Respuesta: $($response.Content)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ ERROR en TEST 2: $_" -ForegroundColor Red
}

# ================================================================
# TEST 3: Endpoint /api/health (Debe funcionar sin autenticación)
# ================================================================

Write-Host "`n`nTEST 3: Endpoint /api/health (Sin Autenticación)" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

Write-Host "`nVerificando que el Worker está activo..." -ForegroundColor Green

try {
    $response = Invoke-WebRequest -Uri "$API_URL/api/health" `
                                 -Method Get `
                                 -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "✅ TEST 3 PASÓ: Worker está activo (200 OK)" -ForegroundColor Green
        $jsonResponse = $response.Content | ConvertFrom-Json
        Write-Host "   Health Status: $($jsonResponse.ok)" -ForegroundColor Green
        Write-Host "   Message: $($jsonResponse.message)" -ForegroundColor Green
    } else {
        Write-Host "❌ TEST 3 FALLÓ: Worker no responde correctamente" -ForegroundColor Red
        Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ ERROR en TEST 3: $_" -ForegroundColor Red
}

# ================================================================
# TEST 4: Token Expirado Debe Ser Rechazado
# ================================================================

Write-Host "`n`nTEST 4: Token Expirado Debe Ser Rechazado" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow

Write-Host "`nCreando JWT con expiración en el pasado..." -ForegroundColor Green

$expiredPayload = @{
    email = "user@example.com"
    sub   = "user_id"
    exp   = [int](([DateTime]::UtcNow.AddDays(-1) - [DateTime]::UnixEpoch).TotalSeconds)  # Expirado hace 1 día
} | ConvertTo-Json

$expiredPayloadBytes = [System.Text.Encoding]::UTF8.GetBytes($expiredPayload)
$expiredPayloadBase64 = [Convert]::ToBase64String($expiredPayloadBytes) -replace '\+','-' -replace '/','_' -replace '=',''

$expiredJWT = "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.$expiredPayloadBase64.fakesignature"

Write-Host "JWT Expirado Creado (expiración: hace 1 día)" -ForegroundColor Gray

$expiredHeaders = @{
    "Authorization" = "Bearer $expiredJWT"
    "Content-Type"  = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri $RESERVAS_ENDPOINT `
                                 -Headers $expiredHeaders `
                                 -Method Get `
                                 -SkipHttpErrorCheck

    if ($response.StatusCode -eq 401) {
        Write-Host "✅ TEST 4 PASÓ: 401 Unauthorized (Token expirado rechazado)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  TEST 4: Status $($response.StatusCode) (esperado 401)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  TEST 4 Error (esperado): $_" -ForegroundColor Gray
}

# ================================================================
# RESUMEN
# ================================================================

Write-Host "`n`n" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "RESUMEN DE TESTS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Si TEST 1 pasó (200 OK):" -ForegroundColor Green
Write-Host "   - JWT validation está funcionando" -ForegroundColor Green
Write-Host "   - Tokens válidos de Supabase son aceptados" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Si TEST 2 pasó (401 Unauthorized):" -ForegroundColor Green
Write-Host "   - JWT spoofing está mitigado" -ForegroundColor Green
Write-Host "   - Tokens falsos son rechazados" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Si TEST 3 pasó (200 OK):" -ForegroundColor Green
Write-Host "   - Worker está activo y desplegado" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Si todos pasaron:" -ForegroundColor Green
Write-Host "   - La corrección de seguridad está COMPLETA Y OPERATIVA" -ForegroundColor Green
Write-Host ""
Write-Host "❌ Si algún test falló:" -ForegroundColor Red
Write-Host "   - Ejecuta: wrangler deploy" -ForegroundColor Red
Write-Host "   - Espera 30 segundos y reintenta" -ForegroundColor Red
Write-Host ""
