-- ==========================================================
-- Configuration
-- ==========================================================
local COOLDOWN_MS = 2500
local HEAR_SELF = true

local lastTtsUseTime = 0
local isTtsPanelOpen = false
local isAuthorized = false

AddEventHandler('onClientResourceStart', function (resourceName)
    if (GetCurrentResourceName() ~= resourceName) then return end
    TriggerServerEvent('shl_tts:requestAuth')
end)

RegisterNetEvent('shl_tts:authResult', function(authorized)
    isAuthorized = authorized
end)

-- ==========================================================
-- Utilitaires de Voix (pma-voice)
-- ==========================================================
local function getPlayerVoiceDistance()
    local proximity = LocalPlayer.state.proximity
    return (proximity and proximity.distance) and proximity.distance or 7.0
end

local function getPlayerVoiceMode()
    local proximity = LocalPlayer.state.proximity
    return (proximity and proximity.mode) and proximity.mode or 'Normal'
end

-- ==========================================================
-- Effets Visuels
-- ==========================================================
local function drawProximityCircle(radius)
    CreateThread(function()
        local endTime = GetGameTimer() + 1500
        while GetGameTimer() < endTime do
            local coords = GetEntityCoords(PlayerPedId())
            DrawMarker(
                1, coords.x, coords.y, coords.z - 1.0, 
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 
                radius * 2.0, radius * 2.0, 0.5, 
                100, 200, 255, 80, 
                false, false, 2, false, nil, nil, false
            )
            Wait(0)
        end
    end)
end

-- ==========================================================
-- Logique TTS Principale
-- ==========================================================
local function sendTtsMessage(text)
    if not isAuthorized then return end
    if not text or text == '' then return end

    local currentTime = GetGameTimer()
    if currentTime - lastTtsUseTime < COOLDOWN_MS then
        local timeRemaining = COOLDOWN_MS - (currentTime - lastTtsUseTime)
        SendNUIMessage({ type = 'cooldownUpdate', remaining = timeRemaining, total = COOLDOWN_MS })
        return
    end
    lastTtsUseTime = currentTime

    SendNUIMessage({ type = 'cooldownStart', total = COOLDOWN_MS })

    local pedCoords = GetEntityCoords(PlayerPedId())
    local voiceRange = getPlayerVoiceDistance()

    if HEAR_SELF then
        --print(('[shl_tts] Distance TTS utilisée: %sm (mode pma-voice)'):format(voiceRange))
        drawProximityCircle(voiceRange)
    end

    TriggerServerEvent('shl_tts:send', text, pedCoords.x, pedCoords.y, pedCoords.z, voiceRange)
    --TriggerEvent('chat:addMessage', { color = {100, 200, 255}, args = {'TTS', '🔊 ' .. text} })
end

local function stopTtsMessage()
    if not isAuthorized then return end
    SendNUIMessage({ type = 'stopAudio' })
    
    local pedCoords = GetEntityCoords(PlayerPedId())
    local voiceRange = getPlayerVoiceDistance()
    TriggerServerEvent('shl_tts:stop', pedCoords.x, pedCoords.y, pedCoords.z, voiceRange)
end

-- ==========================================================
-- Gestion des Contrôles
-- ==========================================================
CreateThread(function()
    while true do
        if isTtsPanelOpen then
            DisableControlAction(0, 1, true)   -- Caméra gauche/droite
            DisableControlAction(0, 2, true)   -- Caméra haut/bas
            DisableControlAction(0, 24, true)  -- Attaque basique
            DisableControlAction(0, 25, true)  -- Visée
            DisableControlAction(0, 140, true) -- Attaque mêlée légère
            DisableControlAction(0, 141, true) -- Attaque mêlée lourde
            DisableControlAction(0, 142, true) -- Blocage
            DisableControlAction(0, 199, true) -- Menu Pause (ESC)
            DisableControlAction(0, 200, true) -- Menu Pause Alternatif (ESC)
            Wait(0)
        else
            Wait(250)
        end
    end
end)

-- ==========================================================
-- Commandes et Raccourcis
-- ==========================================================
local function requestOpenTtsPanel()
    if not isAuthorized then
        TriggerEvent('chat:addMessage', { color = {255, 100, 100}, args = {'TTS', 'Vous n\'avez pas la permission d\'ouvrir le menu TTS.'} })
        return
    end

    if isTtsPanelOpen then
        isTtsPanelOpen = false
        SetNuiFocusKeepInput(false)
        SetNuiFocus(false, false)
        SendNUIMessage({ type = 'closePanel' })
    else
        TriggerServerEvent('shl_tts:requestOpen')
    end
end

RegisterNetEvent('shl_tts:openPanel', function()
    isTtsPanelOpen = true
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true)
    SendNUIMessage({
        type = 'openPanel',
        voiceRange = getPlayerVoiceDistance(),
        voiceMode = getPlayerVoiceMode()
    })
end)

RegisterCommand('+openTTSPanel', requestOpenTtsPanel, false)
RegisterCommand('-openTTSPanel', function() end, false)
RegisterKeyMapping('+openTTSPanel', 'Ouvrir le menu TTS', 'keyboard', "F5")

RegisterCommand('tts', function(source, args)
    if #args == 0 then
        --TriggerEvent('chat:addMessage', { color = {255, 100, 100}, args = {'TTS', 'Usage: /tts [texte à lire]'} })
        return
    end
    sendTtsMessage(table.concat(args, ' '))
end, false)

RegisterCommand('ttsc', function()
    stopTtsMessage()
    --TriggerEvent('chat:addMessage', { color = {255, 200, 100}, args = {'TTS', '⏹ TTS arrêté.'} })
end, false)

RegisterCommand('+stopTTS', function()
    stopTtsMessage()
end, false)
RegisterCommand('-stopTTS', function() end, false)
RegisterKeyMapping('+stopTTS', 'Arrêter la lecture TTS', 'keyboard', "X")

-- ==========================================================
-- Callbacks NUI (Interface Utilisateur)
-- ==========================================================
RegisterNUICallback('sendTTS', function(data, cb)
    sendTtsMessage(data.text)
    cb('ok')
end)

RegisterNUICallback('stopTTS', function(data, cb)
    stopTtsMessage()
    --TriggerEvent('chat:addMessage', { color = {255, 200, 100}, args = {'TTS', '⏹ TTS arrêté.'} })
    cb('ok')
end)

RegisterNUICallback('closePanel', function(data, cb)
    isTtsPanelOpen = false
    SetNuiFocusKeepInput(false)
    SetNuiFocus(false, false)
    
    -- Empêcher le menu Échap de s'afficher juste après la fermeture
    CreateThread(function()
        local endTime = GetGameTimer() + 500
        while GetGameTimer() < endTime do
            DisableControlAction(0, 199, true)
            DisableControlAction(0, 200, true)
            Wait(0)
        end
    end)
    
    cb('ok')
end)

RegisterNUICallback('blockGameInput', function(data, cb)
    if isTtsPanelOpen then SetNuiFocusKeepInput(false) end
    cb('ok')
end)

RegisterNUICallback('unblockGameInput', function(data, cb)
    if isTtsPanelOpen then SetNuiFocusKeepInput(true) end
    cb('ok')
end)

RegisterNUICallback('cycleVoice', function(data, cb)
    ExecuteCommand('cycleproximity')
    
    -- Délai nécessaire pour laisser `pma-voice` actualiser sa state et retourner la nouvelle portée.
    CreateThread(function()
        Wait(50)
        if isTtsPanelOpen then
            SendNUIMessage({
                type = 'voiceUpdate',
                voiceRange = getPlayerVoiceDistance(),
                voiceMode = getPlayerVoiceMode()
            })
        end
    end)
    cb('ok')
end)

-- ==========================================================
-- Événements Réseau
-- ==========================================================
RegisterNetEvent('shl_tts:playAudio', function(audioBase64, volume, senderName)
    SendNUIMessage({ type = 'playAudio', audio = audioBase64, volume = volume })
    --TriggerEvent('chat:addMessage', { color = {100, 200, 255}, args = {('TTS [%s]'):format(senderName), '🔊'} })
end)

RegisterNetEvent('shl_tts:stopAudio', function()
    SendNUIMessage({ type = 'stopAudio' })
end)
