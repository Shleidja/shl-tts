-- ==========================================================
-- Configuration
-- ==========================================================
local TTS_LANG = 'fr'

local WhitelistedDiscords = {
    ['173099931614052352'] = true, -- Shleidja
    ['205165653257093120'] = true -- Qidou
}

local function isPlayerAuthorized(source)
    local identifiers = GetPlayerIdentifiers(source)
    for _, id in ipairs(identifiers) do
        if string.match(id, '^discord:') then
            local discordId = string.gsub(id, 'discord:', '')
            if WhitelistedDiscords[discordId] then
                return true
            end
        end
    end
    return false
end

-- ==========================================================
-- Utilitaires Base64 (Lua Pur)
-- ==========================================================
local b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

local function encodeBase64(data)
    return ((data:gsub('.', function(x)
        local r, byte = '', x:byte()
        for i = 8, 1, -1 do
            r = r .. (byte % 2 ^ i - byte % 2 ^ (i - 1) > 0 and '1' or '0')
        end
        return r
    end) .. '0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c = 0
        for i = 1, 6 do
            c = c + (x:sub(i, i) == '1' and 2 ^ (6 - i) or 0)
        end
        return b64chars:sub(c + 1, c + 1)
    end) .. ({ '', '==', '=' })[#data % 3 + 1])
end

-- ==========================================================
-- Événements Réseau
-- ==========================================================
RegisterNetEvent('shl_tts:send', function(text, x, y, z, voiceRange)
    local src = source
    if not isPlayerAuthorized(src) then return end

    local senderName = GetPlayerName(src)
    local senderCoords = vector3(x, y, z)
    local radius = voiceRange or 7.0
    
    --print(('[shl_tts] TTS de %s | Distance: %sm'):format(senderName, radius))

    -- Construction de l'URL Google TTS
    local encodedText = text:gsub("([^%w ])", function(c)
        return string.format("%%%02X", string.byte(c))
    end):gsub(" ", "%%20")
    
    local url = ('https://translate.google.com/translate_tts?ie=UTF-8&tl=%s&client=tw-ob&q=%s&textlen=%s'):format(TTS_LANG, encodedText, #text)

    -- Requête HTTP côté serveur pour récupérer l'audio (évite les problèmes CORS du côté client)
    PerformHttpRequest(url, function(statusCode, responseData, headers)
        if statusCode ~= 200 or not responseData or #responseData == 0 then
            print(('[shl_tts] Erreur TTS: HTTP %s'):format(tostring(statusCode)))
            return
        end

        local audioBase64 = encodeBase64(responseData)

        -- Envoyer l'audio à l'émetteur (volume max, c'est le client qui décide s'il le joue)
        TriggerClientEvent('shl_tts:playAudio', src, audioBase64, 1.0, senderName)

        -- Diffuser l'audio aux joueurs proches
        for _, playerId in ipairs(GetPlayers()) do
            local targetId = tonumber(playerId)
            if targetId and targetId ~= src then
                local targetPed = GetPlayerPed(targetId)
                if targetPed and DoesEntityExist(targetPed) then
                    local targetCoords = GetEntityCoords(targetPed)
                    local distance = #(senderCoords - targetCoords)

                    if distance <= radius then
                        -- Calcul de l'atténuation du volume en fonction de la distance
                        local volume = math.max(0.05, 1.0 - (distance / radius))
                        TriggerClientEvent('shl_tts:playAudio', targetId, audioBase64, volume, senderName)
                    end
                end
            end
        end
    end, 'GET', '', {
        ['User-Agent'] = 'Mozilla/5.0',
        ['Referer'] = 'https://translate.google.com/'
    })
end)

RegisterNetEvent('shl_tts:requestAuth', function()
    local src = source
    TriggerClientEvent('shl_tts:authResult', src, isPlayerAuthorized(src))
end)

RegisterNetEvent('shl_tts:requestOpen', function()
    local src = source
    if isPlayerAuthorized(src) then
        TriggerClientEvent('shl_tts:openPanel', src)
    else
        TriggerClientEvent('chat:addMessage', src, { color = {255, 100, 100}, args = {'TTS', 'Vous n\'avez pas la permission d\'ouvrir le menu TTS.'} })
    end
end)

RegisterNetEvent('shl_tts:stop', function(x, y, z, voiceRange)
    local src = source
    if not isPlayerAuthorized(src) then return end

    local senderCoords = vector3(x, y, z)
    local radius = voiceRange or 7.0

    for _, playerId in ipairs(GetPlayers()) do
        local targetId = tonumber(playerId)
        if targetId and targetId ~= src then
            local targetPed = GetPlayerPed(targetId)
            if targetPed and DoesEntityExist(targetPed) then
                local targetCoords = GetEntityCoords(targetPed)
                local distance = #(senderCoords - targetCoords)

                if distance <= radius then
                    TriggerClientEvent('shl_tts:stopAudio', targetId)
                end
            end
        end
    end
end)
