fx_version 'cerulean'
games { 'gta5' }

author 'Shleidja'
description 'Text-to-Speech en zone - /tts'
version '1.0.0'

ui_page 'web/index.html'

files {
    'web/index.html',
    'web/script.js',
    'web/style.css',
    'web/bg.png'
}

server_scripts {
    'server.lua'
}

client_scripts {
    'client.lua'
}
