-- phpMyAdmin SQL Dump
-- version 5.0.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Erstellungszeit: 19. Feb 2020 um 21:40
-- Server-Version: 10.4.12-MariaDB
-- PHP-Version: 7.4.2

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Datenbank: `tellschn_v2`
--

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `answers`
--

CREATE TABLE `answers` (
  `id` int(11) NOT NULL,
  `for_tell_id` varchar(64) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `content` varchar(10000) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `show_public` tinyint(1) NOT NULL DEFAULT 1,
  `tweet_id` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `show_media_public` tinyint(1) DEFAULT NULL,
  `was_edited` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `attachment_media`
--

CREATE TABLE `attachment_media` (
  `id` int(11) NOT NULL,
  `media_uuid` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `is_mp4` tinyint(1) NOT NULL DEFAULT 0,
  `size` varchar(64) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `cdn_path` varchar(90) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `tells`
--

CREATE TABLE `tells` (
  `id` int(11) NOT NULL,
  `for_user_id` varchar(64) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `by_user_id` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `deleted` tinyint(1) DEFAULT 0,
  `media_attachment` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `content` varchar(9999) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `do_not_share` tinyint(1) NOT NULL DEFAULT 0,
  `do_not_share_media` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `twitter_id` varchar(64) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `twitter_handle` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `joined` timestamp NOT NULL DEFAULT current_timestamp(),
  `custom_configuration` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `profile_pic_original_link` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `profile_pic_small_link` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `oauth_token` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `oauth_secret` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `set_name` varchar(50) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `custom_page_text` varchar(1000) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `im_config` varchar(512) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `user_access_sharing`
--

CREATE TABLE `user_access_sharing` (
  `id` int(11) NOT NULL,
  `from_user_id` varchar(128) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `to_user_id` varchar(128) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- --------------------------------------------------------

--
-- Tabellenstruktur für Tabelle `user_notification_services`
--

CREATE TABLE `user_notification_services` (
  `id` int(11) NOT NULL,
  `twitter_id` varchar(64) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `platform` varchar(32) COLLATE utf8mb4_unicode_520_ci NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `validation_token` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `recipient_name` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

--
-- Indizes der exportierten Tabellen
--

--
-- Indizes für die Tabelle `answers`
--
ALTER TABLE `answers`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `attachment_media`
--
ALTER TABLE `attachment_media`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `tells`
--
ALTER TABLE `tells`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `user_access_sharing`
--
ALTER TABLE `user_access_sharing`
  ADD PRIMARY KEY (`id`);

--
-- Indizes für die Tabelle `user_notification_services`
--
ALTER TABLE `user_notification_services`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT für exportierte Tabellen
--

--
-- AUTO_INCREMENT für Tabelle `answers`
--
ALTER TABLE `answers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `attachment_media`
--
ALTER TABLE `attachment_media`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `tells`
--
ALTER TABLE `tells`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `user_access_sharing`
--
ALTER TABLE `user_access_sharing`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT für Tabelle `user_notification_services`
--
ALTER TABLE `user_notification_services`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
