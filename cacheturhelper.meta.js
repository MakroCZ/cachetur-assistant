// ==UserScript==
// @name            The Cachetur Assistant edited
// @name:no         Cacheturassistenten
// @author          cachetur.no, thomfre, Makro
// @namespace       http://cachetur.no/
// @version         3.5.1.03.02
// @description     Companion script for cachetur.no
// @description:no  Hjelper deg å legge til cacher i cachetur.no
// @icon            https://cachetur.net/img/logo_top.png
// @match           https://www.geocaching.com/play/map*
// @match           https://www.geocaching.com/map/*
// @match           https://www.geocaching.com/play/map*
// @match           https://www.geocaching.com/geocache/*
// @match           https://www.geocaching.com/seek/cache_details.aspx*
// @match           https://www.geocaching.com/plan/lists/BM*
// @match           https://www.geocaching.com/play/geotours/*
// @match           file:///*/gsak/html/*
// @match           file:///*/html/*
// @match           https://project-gc.com/*
// @match           https://cachetur.no/bobilplasser
// @connect         cachetur.no
// @connect         cachetur.net
// @connect         self
// @grant           GM_xmlhttpRequest
// @grant           GM_info
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_openInTab
// @grant           GM_registerMenuCommand
// @grant           GM_addStyle
// @grant           unsafeWindow
// @run-at          document-end
// @copyright       2017+, cachetur.no
// @require         https://raw.githubusercontent.com/sizzlemctwizzle/GM_config/master/gm_config.js
// @require         https://raw.github.com/odyniec/MonkeyConfig/master/monkeyconfig.js
// @require         https://code.jquery.com/jquery-latest.js
// @require         https://unpkg.com/i18next@21.8.13/i18next.min.js
// @require         https://unpkg.com/i18next-xhr-backend@3.2.2/i18nextXHRBackend.js
// @require         https://unpkg.com/i18next-browser-languagedetector@6.1.4/i18nextBrowserLanguageDetector.js
// @require         https://gist.github.com/raw/2625891/waitForKeyElements.js
// @updateURL       https://github.com/MakroCZ/cachetur-assistant/raw/master/cacheturhelper.meta.js
// @downloadURL     https://github.com/MakroCZ/cachetur-assistant/raw/master/cacheturhelper.user.js
// @supportURL      https://github.com/MakroCZ/cachetur-assistant/issues
// ==/UserScript==
/* globals jQuery, $, waitForKeyElements, L, i18next, i18nextXHRBackend, i18nextBrowserLanguageDetector, cloneInto */
