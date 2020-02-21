# Tellschn

Eine Open-Source Implementation von "Tellonym", entwickelt in node.js mithilfe des Express Frameworks.

## Features:
- Social Media Share Funktionen
- Anbindung an Twitter
- Foto & Video Upload mit automatischem Transcoding
- Eigene Gestaltung der Profilseite
- Nutzer kann Zugriff auf den eigenen Account an andere Nutzer teilen
- Telegram Benachrichtigungen

## Installation
Die Software benötigt einen Datenbankstack aus MySQL und Redis. Das MySQL Datenbankschema lässt sich in tellschn_v2.sql im Repo finden.
Schritt 1:
> npm install

Schritt 2:

> cp access-config.json.template access-config.json

Schritt 3:

access-config.json und app-config.json mit den eigenen Daten ausfüllen

Schritt 4:

nginx Reverse Proxy aufsetzen, der auf den Webserverport (bzw. auf den Port vom Webserver Cluster wenn per pm2 deployt) und letsencrypt einbinden

Schritt 5:

Deploy! Microservices worker.js und webserver.js müssen gestartet werden, für Telegram Benachrichtigungen telegram_worker.js. Vom Telegram Worker darf jedoch nur eine Instanz gestartet werden, da Telegram nur eine Botinstanz zulässt.