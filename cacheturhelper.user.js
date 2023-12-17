// ==UserScript==
// @name            The Cachetur Assistant edited
// @name:no         Cacheturassistenten
// @author          cachetur.no, thomfre, Makro
// @namespace       http://cachetur.no/
// @version         3.5.1.03.04
// @description     Companion script for cachetur.no
// @description:no  Hjelper deg å legge til cacher i cachetur.no
// @icon            https://cachetur.net/img/logo_top.png
// @match           https://www.geocaching.com/play/map*
// @match           https://www.geocaching.com/map/*
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
// @require         https://raw.githubusercontent.com/cghove/GM_config/master/gm_config.js
// @require         https://code.jquery.com/jquery-latest.js
// @require         https://unpkg.com/i18next@22.4.9/i18next.min.js
// @require         https://unpkg.com/i18next-xhr-backend@3.2.2/i18nextXHRBackend.js
// @require         https://unpkg.com/i18next-browser-languagedetector@7.0.1/i18nextBrowserLanguageDetector.js
// @updateURL       https://github.com/MakroCZ/cachetur-assistant/raw/master/cacheturhelper.meta.js
// @downloadURL     https://github.com/MakroCZ/cachetur-assistant/raw/master/cacheturhelper.user.js
// @supportURL      https://github.com/MakroCZ/cachetur-assistant/issues
// ==/UserScript==
/* globals jQuery, $, L, i18next, i18nextXHRBackend, i18nextBrowserLanguageDetector, cloneInto, gm_config */

let $ = jQuery = jQuery.noConflict(true);
let _ctLastCount = 0;
let _ctCacheturUser = "";
let _ctLanguage = "";
let _ctCodesAdded = [];
let _ctPage = "unknown";
let _routeLayer = [];
let _waypointLayer = [];
let _cacheLayer = [];
let _initialized = false;
let _ctNewMapActiveCache = "";
let _codenm = "";
let settings = "";

function waitForElement(selector) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver((mutations) => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    });
}

function HTMLStringToElement(string) {
    const template = document.createElement("template");
    string = string.trim();
    template.innerHTML = string;
    return template.content.firstChild;
}

let _ctPageHandler = null;

// TODO: Move to external file downloaded when starting, as random gorgon
const ambassadorNames = ["Heltinnen", "DougyB", "cghove", "Korsgat", "Don Rodolphos", "platoaddict",
                         "rragan", "twlare", "GorgonVaktmester", "Olet", "footie77", "HikingSeal", 
                         "Vatvedt", "kawlii", "Kittykatch", "anirt", "QuoX", "flower6871", "juliekatrine"];

/**
 * "Abstract" base class for individual page handlers (GC cache detail, GC old map, GC new map, PGC, ...)
 */
class PageHandler {
    ctID;
    headerElement;

    get_ctID() {
        return this.ctID;
    }

    async waitForNeededElements() {
        throw Error("Not implemented");
    }

    ctInitNotLoggedIn() {
        console.log("Adding style NotLoggedIn");
        GM_addStyle(
            `#cachetur-header {
                padding: 8px 1em 18px 2em;
            }
            
            #cachetur-header-text {
                padding-right: 3px;
                float: left;
                margin-top: -12px;
            }
            
            #gc-header nav {
                align-items: center;
                box-sizing: border-box;
                display: flex;
                max-width: fit-content;
                min-height: 80px;
                overflow: visible;
                padding: 0 12px;
                position: relative !important;
                width: 100vw;
            }`
        );
        //throw Error("Not implemented");
    }

    ctInitInactive() {
        console.log("Adding style Inactive");
        GM_addStyle(
            `#cachetur-header {
                padding: 8px 1em 22px 2em;
            }
            
            #cachetur-header-text {
                padding-right: 3px;
                float: left;
            }
            
            #gc-header {
                background-color: #02874d;
                color: white;
                font-size: 16px;
                height: fit-content;
                width: 100%;
            }
            
            .player-profile {
                width: fit-content;
            }`
        );
        //throw Error("Not implemented");
    }

    ctCreateTripList() {
        console.log("Adding style CreateTripList");
        GM_addStyle(
            `#cachetur-header {
                padding: 8px 1em 22px 2em;
                display: flex;
                flex-direction: row;
                align-items: center;
                white-space: nowrap;
            }
            
            #cachetur-tur-valg {
                float: left;
                width: 200px;
                height: 24px;
                overflow: hidden;
                background: #eee;
                color: black;
                border: 1px solid #ccc;
                padding: 0px;
                appearance: auto;
            }`
        );
        //throw Error("Not implemented");
    }

    getHeaderElement() {
        if (this.headerElement) {
            return this.headerElement;
        }
        this.headerElement = document.querySelector(this.getHeaderSelector());
        if (this.headerElement) {
            return this.headerElement;
        }
        throw Error(
            "Header element:" + this.getHeaderSelector() + " not found"
        );
    }

    getHeaderSelector() {
        throw Error("Not implemented");
    }
}

class GC_CachePageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gc_geocache";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 18px 2em; } #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } "
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } "
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header nav { max-width: none;} #gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} select {-moz-appearance: none; background: #fffurl(../ui-icons/icons/global/caret-down.svg) no-repeat;} #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { padding: 0px;; appearance: auto; float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .css-az98zw nav {    -webkit-box-align: center; align-items: center; box-sizing: border-box; display: flex; min-height: 80px; overflow: visible; padding: 0px 12px; width: 100vw; position: relative !important; max-width: 100%; padding: 0px 32px; font-size: 16px;} .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px;.cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }"
        );
    }
*/
    getHeaderSelector() {
        return ".user-menu";
    }
}

// Old map
class GC_BrowseMapPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gc_map";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px; }"
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header-text { padding-right: 3px; float:left; }"
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #cachetur-header button { width: 26px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px; }"
        );
    }
*/
    getHeaderSelector() {
        return ".user-menu";
    }
}

// New map
class GC_SearchMapPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gc_map_new";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px; }"
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "#cachetur-header button { width: 26px; } #cachetur-header { ;padding-top:8px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header-text { padding-right: 3px; float:left; }"
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px;.cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }"
        );
    }
*/
    getHeaderSelector() {
        return ".user-menu";
    }
}

class GC_BookmarkListPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gc_bmlist";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 18px 2em; } #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } "
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } "
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} .gc-nav-menu .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw; height: fit-content;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-tur-fitbounds { display: none; } #cachetur-tur-add-ct-caches { display: none; } .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { padding-left: 4px; } .cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }"
        );
    }
*/
    getHeaderSelector() {
        return ".user-menu";
    }
}

class GC_GeotourPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gc_geotour";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "#cachetur-header { padding-top:8px; }#gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;}  #cachetur-header-text { padding-right: 3px; float:left; }"
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "#cachetur-header { padding-top:8px; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header-text { padding-right: 3px; float:left; }"
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; font: 13.3333px Arial; padding:1px; } .cachetur-menu-button { background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;} #cachetur-header-text { padding-right: 3px; float:left; } #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px; }"
        );
    }
*/
    getHeaderSelector() {
        return ".user-menu";
    }
}

class PGC_VirtualGPSPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "pgc_vgps";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle("#cachetur-header { margin-top: 7px; }");
    }

    ctInitInactive() {
        GM_addStyle("#cachetur-header { margin-top: 12px; }");
    }

    ctCreateTripList() {
        GM_addStyle(
            "#cachetur-header { margin-top: 7px; } #cachetur-tur-valg { width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; }"
        );
    }
*/
    getHeaderSelector() {
        return "#pgcMainMenu ul.navbar-right";
    }
}

class PGC_MapPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "pgc_map";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle("#cachetur-header { margin-top: 7px; }");
    }

    ctInitInactive() {
        GM_addStyle("#cachetur-header { margin-top: 12px; }");
    }

    ctCreateTripList() {
        GM_addStyle(
            "#cachetur-header { margin-top: 7px; } #cachetur-tur-valg { width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; }"
        );
    }
*/
    getHeaderSelector() {
        return "#pgcMainMenu ul.navbar-right";
    }
}

class GSAK_PageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "gsak";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 18px 2em; } #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } "
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } "
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;}  #cachetur-header-text { padding-right: 3px; float:left; display: none;} #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px;.cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }"
        );
    }
*/
    getHeaderSelector() {
        return ".leaflet-control-scale";
    }
}

class CT_RVSitesPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "bobil";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }
/*
    ctInitNotLoggedIn() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #cachetur-header { padding: 8px 1em 18px 2em; } #gc-header nav {align-items: center; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left; margin-top: -12px;  } "
        );
    }

    ctInitInactive() {
        GM_addStyle(
            "nav .wrapper { max-width: unset; } #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #gc-header nav {align-items: center; height: fit-content; box-sizing: border-box; display: flex; max-width: fit-content; min-height: 80px; overflow: visible; padding: 0 12px; position: relative !important; width: 100vw;} #cachetur-header { padding: 8px 1em 22px 2em; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } #cachetur-header-text { padding-right: 3px; float:left;  } "
        );
    }

    ctCreateTripList() {
        GM_addStyle(
            "#gc-header button {border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s;display: flex;justify-content: center;align-items: center;} #gc-header {background-color: #02874d; color: white; font-size: 16px; height: fit-content; width: 100%;} .player-profile {width: fit-content;} #cachetur-header { ;padding-top:8px; } #cachetur-tur-valg { float:left; width: 200px; height: 24px; overflow: hidden; background: #eee; color: black; border: 1px solid #ccc; } .cachetur-menu-button { border: 2px solid transparent; border-radius: 12px; font-family: Noto Sans, sans-serif; padding: 4px 8px; transition: border-color 0.2s; display: flex; justify-content: center; align-items: center; background-color: #eee; padding-right: 4px; padding-left: 4px; border: 1px solid rgba(0,0,0,0.1); height: 24px; width: 24px; float:left;}  #cachetur-header-text { padding-right: 3px; float:left; display: none;} #cachetur-tur-antall-container { float: right; margin-top: 2px; padding-left: 3px;.cachetur-add-code { background-image: url(https://cachetur.no/api/img/cachetur-15.png); } .cachetur-add-code-success { background-image: url(https://cachetur.no/api/img/cachetur-15-success.png); } .cachetur-add-code-error { background-image: url(https://cachetur.no/api/img/cachetur-15-error.png); } .cachetur-set-pri-1 { background-image: url(https://cachetur.no/api/img/p1.png); } .cachetur-set-pri-1-success { background-image: url(https://cachetur.no/api/img/p1_success.png); } .cachetur-set-pri-1-error { background-image: url(https://cachetur.no/api/img/p1_error.png); } .cachetur-set-pri-2 { background-image: url(https://cachetur.no/api/img/p2.png); } .cachetur-set-pri-2-success { background-image: url(https://cachetur.no/api/img/p2_success.png); } .cachetur-set-pri-2-error { background-image: url(https://cachetur.no/api/img/p2_error.png); } .cachetur-set-pri-3 { background-image: url(https://cachetur.no/api/img/p3.png); } .cachetur-set-pri-3-success { background-image: url(https://cachetur.no/api/img/p3_success.png); } .cachetur-set-pri-3-error { background-image: url(https://cachetur.no/api/img/p3_error.png); } .cachetur-add-comment { background-image: url(https://cachetur.no/api/img/cachetur-comment.png); } .cachetur-add-comment-success { background-image: url(https://cachetur.no/api/img/cachetur-comment-success.png); } .cachetur-add-comment-error { background-image: url(https://cachetur.no/api/img/cachetur-comment-error.png); }"
        );
    }
*/
    getHeaderSelector() {
        return ".navbar-right";
    }
}

class CT_TripPageHandler extends PageHandler {
    constructor() {
        super();
        this.ctID = "fellestur";
    }

    async waitForNeededElements() {
        await waitForElement(this.getHeaderSelector());
    }

    ctInitNotLoggedIn() {
        console.log("Overidden in child");
    }

    ctInitInactive() {
        console.log("Overidden in child");
    }

    ctCreateTripList() {
        console.log("Overidden in child");
    }

    getHeaderSelector() {
        console.log("Overriden in child");
    }
}

console.log("Starting Cacheturassistenten V. " + GM_info.script.version);
let pathname = window.location.pathname;
// let domain = document.domain; deprecated, should be working but not recommended
let domain = window.location.hostname;
let href = window.location.href;

if (domain === "www.geocaching.com") {
    if (pathname.indexOf("/seek/") > -1) {
        _ctPageHandler = new GC_CachePageHandler(); // Useless?
    } else if (pathname.indexOf("/plan/lists") > -1) {
        _ctPageHandler = new GC_BookmarkListPageHandler();
    } else if (pathname.indexOf("/geocache/") > -1) {
        _ctPageHandler = new GC_CachePageHandler();
    } else if (pathname.indexOf("/map/") > -1) {
        _ctPageHandler = new GC_BrowseMapPageHandler();
    } else if (pathname.indexOf("/play/map") > -1) {
        _ctPageHandler = new GC_SearchMapPageHandler();
    } else if (pathname.indexOf("/play/geotours") > -1) {
        _ctPageHandler = new GC_GeotourPageHandler();
    }
} else if (href.indexOf("/html/") > -1) {
    _ctPageHandler = new GSAK_PageHandler();
} else if (pathname.startsWith("/bobilplasser/")) {
    _ctPageHandler = new CT_RVSitesPageHandler();
} else if (pathname.startsWith("/fellestur/")) {
    _ctPageHandler = new CT_TripPageHandler(); // Useless?
} else if (
    domain === "project-gc.com" &&
    pathname.indexOf("/User/VirtualGPS") > -1 &&
    window.location.search.indexOf("?map=") === -1
) {
    _ctPageHandler = new PGC_VirtualGPSPageHandler();
} else if (domain === "project-gc.com") {
    _ctPageHandler = new PGC_MapPageHandler();
}


// TODO: Solve these weird user name based abominations, at least get it to one generic function
function gorgon() {
    $.get(
        "https://raw.githubusercontent.com/cghove/bobil/main/a.txt",
        function (data) {
            var cardRules = data.split("\n");
            var randomgorgon = Math.floor(Math.random() * cardRules.length);
            var randomNamegorgon = cardRules[randomgorgon];
            ctPrependTousergorgon(
                '<li id="cachetur-header2" style="padding-left: 75px;padding-right: 45px;">' +
                    randomNamegorgon +
                    "</li>"
            );

            ctPrependTousergorgon2(
                '<li id="cachetur-header2" style="padding-left: 75px;padding-right: 45px;">' +
                    randomNamegorgon +
                    "</li>"
            );
        }
    );
}

function thomfre1() {
    $.get(
        "https://raw.githubusercontent.com/cghove/bobil/main/b.txt",
        function (data) {
            var cardRules = data.split("\n");
            var randomthomfre = Math.floor(
                Math.random() * cardRules.length
            );
            var randomNamethomfre = cardRules[randomthomfre];
            ctPrependTousergclh(
                '<li id="cachetur-header"><span id="cachetur-header-text">' +
                    randomNamethomfre +
                    "</li>"
            );
        }
    );
}
function thomfre() {
    $.get(
        "https://raw.githubusercontent.com/cghove/bobil/main/b.txt",
        function (data) {
            var cardRules = data.split("\n");
            var randomthomfre = Math.floor(
                Math.random() * cardRules.length
            );
            var randomNamethomfre = cardRules[randomthomfre];

            ctPrependTousergorgon2(
                '<li id="cachetur-header2" style="padding-left: 75px;padding-right: 45px;">' +
                    randomNamethomfre +
                    "</li>"
            );
        }
    );
}



async function loadTranslations() {
    debugger;
    await i18next
        .use(i18nextXHRBackend)
        .use(i18nextBrowserLanguageDetector)
        .init(
            {
                whitelist: [
                    "nb_NO",
                    "en",
                    "de_DE",
                    "sv_SE",
                    "en_US",
                    "da_DK",
                    "nl_NL",
                    "fr_FR",
                    "cs_CZ",
                    "fi_FI",
                    "es_ES",
                ],
                preload: [
                    "nb_NO",
                    "en",
                    "de_DE",
                    "sv_SE",
                    "en_US",
                    "da_DK",
                    "nl_NL",
                    "fr_FR",
                    "cs_CZ",
                    "fi_FI",
                    "es_ES",
                ],
                fallbackLng: [
                    "nb_NO",
                    "en",
                    "de_DE",
                    "sv_SE",
                    "en_US",
                    "da_DK",
                    "nl_NL",
                    "fr_FR",
                    "cs_CZ",
                    "fi_FI",
                    "es_ES",
                ],
                lng: navigator.language || navigator.userLanguage,
                ns: ["cachetur"],
                defaultNS: "cachetur",
                backend: {
                    loadPath:
                        "https://cachetur.no/monkey/language/{{ns}}.{{lng}}.json",
                    crossDomain: true,
                },
            },
            (err, t) => {
                if (err) {
                    if (err.indexOf("failed parsing" > -1)) {
                        i18next.changeLanguage("en");

                        return loadTranslations();
                    }
                    return console.log(
                        "Error occurred when loading language data",
                        err
                    );
                }

                console.log(
                    "Translation fetched successfully " +
                        " " +
                        i18next.resolvedLanguage
                );
            }
        );
}


//Fill Menu
async function ctStartmenu() {
    let uc1;
    let uc3;
    
    if ("undefined" != typeof GM_config) {
        GM_config.init({
            id: "MyConfig",
            title:
                i18next.t("edit.assistant") +
                " " +
                i18next.t("edit.settings") +
                "<br> ",
            fields: {
                uc1: {
                    label:
                        "<b>" +
                        i18next.t("edit.toggle") +
                        '</b><br><i class="small">' +
                        i18next.t("edit.default") +
                        " " +
                        i18next.t("edit.off") +
                        "</i> ",
                    type: "checkbox",
                    default: false,
                },

                uc3: {
                    label:
                        "<b>" +
                        i18next.t("edit.dt") +
                        '</b><br><i class="small">' +
                        i18next.t("edit.default") +
                        " " +
                        i18next.t("edit.off") +
                        "</i> ",
                    type: "checkbox",
                    default: false,
                },
            },
        });
        GM_registerMenuCommand(
            GM_info.script.name + i18next.t("edit.configure"),
            function () {
                GM_config.open();
            },
            "C"
        );

        uc1 = GM_config.get("uc1");
        uc3 = GM_config.get("uc3");
    } else {
        console.log(
            "Could not load GM_config! external resource may be temporarily down?\nUsing default settings for now.",
            1,
            "error"
        );

        GM_registerMenuCommand(
            GM_info.script.name + " Settings",
            function () {
                console.log(
                    "Could not load GM_config! external resource may be temporarily down?\nUsing default settings for now."
                );
            }
        );
    }

    if (uc1 === true) {
        updatecoord();
    }
    if (uc3 === true) {
        await waitForElement("#cachetur-tur-valg");
        tvinfo();
    }
}

function ctStart() {
    debugger;
    let lastUse = GM_getValue("cachetur_last_action", 0);
    let timeSinceLastUse = (Date.now() - lastUse) / 1000;
    console.log(
        "The Cachetur Assistant was last used " +
            timeSinceLastUse +
            " seconds ago"
    );

    if (timeSinceLastUse > 3600) {
        ctInitInactive();
    } else {
        ctPreInit();
    }
}

function ctPreInit() {
    debugger;
    console.log("Continuing init of Cacheturassistenten");
    if (_ctPageHandler === null && $(".logged-in-user").length < 1) {
        $(document).bind("DOMSubtreeModified.cachetur-init", function () {
            if ($(".profile-panel.detailed").length > 0) {
                $(document).unbind("DOMSubtreeModified.cachetur-init");
                ctCheckLogin();
            }
        });
    } else if (_ctPageHandler instanceof GC_SearchMapPageHandler) {
        ctCheckLogin();
    } else if (
        _ctPageHandler instanceof GC_GeotourPageHandler &&
        $(".user-menu,.profile-panel.detailed").length < 1
    ) {
        $(document).bind("DOMSubtreeModified.cachetur-init", function () {
            if ($(".logged-in-user").length > 0) {
                $(document).unbind("DOMSubtreeModified.cachetur-init");
                ctCheckLogin();
            }
        });
    } else {
        ctCheckLogin();
    }
}



async function ctCheckLogin() {
    console.log("Checking login");
    debugger;
    let response;
    try {
        response = await ctApiCall("user_get_current", "");
    } catch (e) {
        console.log("Authorization failed: " + e);
        console.log("Not logged in");
        ctInitNotLoggedIn();
        return;
    }
    console.log("Checking login data recieved");
    debugger;
    _ctCacheturUser = response.username;
    _ctLanguage = response.language;
    i18next.changeLanguage(_ctLanguage);
    if ($("#GClh_II_running")[0] && $("gclh_nav#ctl00_gcNavigation")[0]) {
        if (ambassadorNames.includes(_ctCacheturUser))
            ctPrependTousergclh(
                '<li id="cachetur-header1"><span id="cachetur-header-text">' +
                    "Ambassador" +
                    "</li>"
            );
        if (_ctCacheturUser === "thomfre") thomfre1();
        if (_ctCacheturUser === "GorgonVaktmester") gorgon();
    } else {
        if (ambassadorNames.includes(_ctCacheturUser))
            ctPrependTouser(
                '<li id="cachetur-header1"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /></li><li id="cachetur-header1"><span id="cachetur-header-text">' +
                    "Ambassador" +
                    "</li>"
            );
        if (_ctCacheturUser === "thomfre") thomfre();
        if (_ctCacheturUser === "GorgonVaktmester") gorgon();
    }

        
        console.log("Login OK");
        ctInit();
}

function ctInvalidateLogin() {
    _ctCacheturUser = "";
    $("#cachetur-header").remove();
}

function ctApiCall(call, params) {
    let appId =
        "Cacheturassistenten " +
        GM_info.script.version +
        " - " +
        _ctPageHandler.get_ctID();

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://cachetur.no/api/" + call,
            data:
                "appid=" +
                encodeURIComponent(appId) +
                "&json=" +
                encodeURIComponent(JSON.stringify(params)),
            withCredentials: true,
            crossDomain: true,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            onload: function (data) {
                try {
                    let response = JSON.parse(data.responseText);

                    if (response.error === "UNAUTHORIZED") {
                        ctInvalidateLogin();
                        reject(new Error("User unathorized"));
                    }
                    resolve(response.data);
                } catch (e) {
                    console.warn(
                        "Failed to verify response from cachetur.no: " + e
                    );
                    reject(e);
                }
            },
            onerror: function (error) {
                reject(error);
            },
            ontimeout: function (error) {
                reject(error);
            },
        });
    });
}

function ctInit() {
    debugger;
    if (_initialized) return;
    console.log("Initializing Cacheturassistenten");
    ctCreateTripList();
    ctInitAddLinks();
    ctInitPGCLiveMapListener();
    ctInitgsakMapListener();
    _initialized = true;
    console.log("Initialization completed");
}

async function ctInitNotLoggedIn() {
    if (_initialized) return;
    _ctPageHandler.ctInitNotLoggedIn();

    if ($("#GClh_II_running")[0] && $("gclh_nav#ctl00_gcNavigation")[0]) {
        ctPrependToHeader2(
            '<li id="cachetur-header"><span id="cachetur-header-text"><a href="https://cachetur.no/" target="_blank"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> ' +
                i18next.t("menu.notloggedin") +
                "<br>" +
                i18next.t("menu.deactivated") +
                "</span></a></li>"
        );
        var liText = "",
            liList = $("#ctl00_uxLoginStatus_divSignedIn li"),
            listForRemove = [];

        $(liList).each(function () {
            var text = $(this).text();

            if (liText.indexOf("|" + text + "|") == -1)
                liText += "|" + text + "|";
            else listForRemove.push($(this));
        });

        $(listForRemove).each(function () {
            $(this).remove();
        });
    } else {
        ctPrependToHeader(
            '<li id="cachetur-header"><span id="cachetur-header-text"><a href="https://cachetur.no/" target="_blank"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> ' +
                i18next.t("menu.notloggedin") +
                "<br>" +
                i18next.t("menu.deactivated") +
                "</span></a></li>"
        );
        var liText2 = "",
            liList2 = $(".user-menu li"),
            listForRemove2 = [];

        $(liList2).each(function () {
            var text = $(this).text();

            if (liText2.indexOf("|" + text + "|") == -1)
                liText2 += "|" + text + "|";
            else listForRemove2.push($(this));
        });

        $(listForRemove2).each(function () {
            $(this).remove();
        });
    }

    _initialized = true;
}

async function ctInitInactive() {
    debugger;
    if (_initialized) return;
    console.log("Assistant not being actively used, disabling");
    _ctPageHandler.ctInitInactive();

    if ($("#GClh_II_running")[0] && $("gclh_nav#ctl00_gcNavigation")[0]) {
        ctPrependToHeader2(
            '<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> <a href id="cachetur-activate">' +
                i18next.t("activate.button") +
                "</a></li>"
        );
        $("#cachetur-activate")[0].onclick = function () {
            GM_setValue("cachetur_last_action", Date.now());
        };

        $("#cachetur-activate").click(function (e) {
            GM_setValue("cachetur_last_action", Date.now());
        });
    } else {
        ctPrependToHeader(
            '<li id="cachetur-header"><span id="cachetur-header-text"><img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" /> <a href id="cachetur-activate">' +
                i18next.t("activate.button") +
                "</a></li>"
        );
        $("#cachetur-activate")[0].onclick = function () {
            GM_setValue("cachetur_last_action", Date.now());
        };

        $("#cachetur-activate").click(function (e) {
            GM_setValue("cachetur_last_action", Date.now());
        });
    }
    _initialized = true;
}

function ctgsakMapInit() {
    $("#map").bind("DOMSubtreeModified", ctgsakMapBindToChanges);

    let storedTrip = GM_getValue("cachetur_selected_trip", 0);
    ctGetAddedCodes(storedTrip);
    ctGetTripRoute(storedTrip);
}

function ctPGCMapInit() {
    console.log("Continuing initialization - PGC Live Map mode");
    $("#map").bind("DOMSubtreeModified", ctPgcMapBindToChanges);

    let storedTrip = GM_getValue("cachetur_selected_trip", 0);
    ctGetAddedCodes(storedTrip);
    ctGetTripRoute(storedTrip);
}

function ctPrependToHeader(data) {
    console.log("Injecting cachetur.no in menu");
    $(".hamburger--squeeze").remove();
    let header = _ctPageHandler.getHeaderElement();

    if (header) {
        var element = HTMLStringToElement(data);
        header.prepend(element);
    }
}

function ctPrependToHeader2(data) {
    console.log("Injecting cachetur.no in menu");
    let header;
    //TODO: ctPage
    if (_ctPage === "gc_map")
        (header = $("#ctl00_uxLoginStatus_divSignedIn")),
            GM_addStyle(
                "gclh_nav .wrapper { max-width: unset; padding-left: 50px; padding-right: 50px; }"
            );
    else if (_ctPage === "gc_map_new")
        (header = $("#ctl00_uxLoginStatus_divSignedIn")),
            GM_addStyle(
                "gclh_nav .wrapper { max-width: unset; padding-left: 50px; padding-right: 50px; }"
            );
    else if (_ctPage === "gc_bmlist")
        (header = $("#ctl00_uxLoginStatus_divSignedIn")),
            GM_addStyle(
                "gclh_nav .wrapper { max-width: unset; padding-left: 50px; padding-right: 50px; }"
            );
    else if (_ctPage === "gc_geocache")
        (header = $("#ctl00_uxLoginStatus_divSignedIn")),
            GM_addStyle(
                "gclh_nav .wrapper { max-width: unset; padding-left: 50px; padding-right: 50px; }"
            );
    else if (_ctPage === "gc_geotour")
        (header = $("#ctl00_uxLoginStatus_divSignedIn")),
            GM_addStyle(
                "gclh_nav .wrapper { max-width: unset; padding-left: 50px; padding-right: 50px; }"
            );
    else if (_ctPage === "bobil") header = $(".navbar-right");
    else if (_ctPage === "gsak") header = $(".leaflet-left");
    else if (_ctPage === "pgc_map" || _ctPage === "pgc_vgps")
        header = $("#pgcMainMenu ul.navbar-right");

    if (header) {
        header.prepend(data);
    }
}

async function ctPrependTouser(data) {
    let header;
    //TODO: ctPage
    if (
        _ctPage === "gc_map" ||
        _ctPage === "gc_map_new" ||
        _ctPage === "gc_bmlist" ||
        _ctPage === "gc_geocache" ||
        _ctPage === "gc_geotour"
    )
        header = $("span.username");

    if (header) {
        header.append(data);
        await waitForElement("#pgc");
        $("#cachetur-header1").remove();
        $("#cachetur-header1").remove();
    }
}

async function ctPrependTousergorgon2(data) {
    let header;
    //TODO: ctPage
    if (
        _ctPage === "gc_map" ||
        _ctPage === "gc_map_new" ||
        _ctPage === "gc_bmlist" ||
        _ctPage === "gc_geocache" ||
        _ctPage === "gc_geotour"
    )
        header = $(".gc-menu");

    if (header) {
        header.append(data);
        await waitForElement("#pgc");
        $("#cachetur-header2").remove();
        $("#cachetur-header2").remove();
    }
}

async function ctPrependTousergclh(data) {
    let header;
    //TODO: ctPage
    if (
        _ctPage === "gc_map" ||
        _ctPage === "gc_map_new" ||
        _ctPage === "gc_bmlist" ||
        _ctPage === "gc_geocache" ||
        _ctPage === "gc_geotour"
    )
        header = $(".user-name");

    if (header) {
        header.append(data);
        await waitForElement("#pgc_gclh");
        $("#cachetur-header2").remove();
    }
}

async function ctPrependTousergorgon(data) {
    let header;
    //TODO: ctPage
    if (
        _ctPage === "gc_map" ||
        _ctPage === "gc_map_new" ||
        _ctPage === "gc_bmlist" ||
        _ctPage === "gc_geocache" ||
        _ctPage === "gc_geotour"
    )
        header = $(".menu");

    if (header) {
        header.append(data);
        await waitForElement("#pgc_gclh");
        $("#cachetur-header1").remove();
    }
}

async function ctCreateTripList() {
    if (_ctCacheturUser === "") return;
    console.log("Inside ctCreateTripList, starting");
    const available = await ctApiCall("planlagt_list_editable", {
        includetemplates: "true",
    });
    console.log("Inside ctCreateTripList, data retrieved");
    let options = "";

    if (available.length > 0) {
        available.forEach(function (item) {
            options =
                options +
                '<option value="' +
                item.id +
                '">' +
                item.turnavn +
                "</option>";
        });
    }

    _ctPageHandler.ctCreateTripList();

    GM_addStyle(
        ".cachetur-menu-button { cursor: pointer; } .cachetur-marker-added { opacity: 0.75; border: 1px solid green; border-radius: 4px; }"
    );
    GM_addStyle(
        ".cachetur-map_marker { width: 18px; height: 18px; font-size: 10px; text-align: center; } " +
            ".cachetur-map_marker_symbol { border: 1px solid gray; -moz-border-radius: 3px; border-radius: 3px; background: #F8F8FF no-repeat center; width: 18px; height: 18px; padding-top: 1px; padding-bottom: 1px; padding-right: 1px; }" +
            ".cachetur-map_marker_disabled { border: 1px solid #ffffff; background-color: #ff0000; } " +
            ".cachetur-map_marker_corrected { border: 1px solid #ffffff; background-color: greenyellow; } " +
            ".cachetur-map_marker_dnf { border: 1px solid #ffffff; background-color: dodgerblue; } "
    );

    if ($("#GClh_II_running")[0] && $("gclh_nav#ctl00_gcNavigation")[0]) {
        ctPrependToHeader2(
            '<li id="cachetur-header"><img src="https://cachetur.net/img/logo_top.png" title="' +
                i18next.t("menu.loggedinas") +
                " " +
                _ctCacheturUser +
                '" /> ' +
                i18next.t("menu.addto") +
                ' <select id="cachetur-tur-valg">' +
                options +
                '</select><button id="cachetur-tur-open" class="cachetur-menu-button" type="button" title="' +
                i18next.t("menu.opentrip") +
                '"><img src="https://cachetur.no/api/img/arrow.png" style="height:16px; top: 50%; left:50%;"/></button><button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" title="' +
                i18next.t("menu.refresh") +
                '"><img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/></button><button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" title="' +
                i18next.t("menu.showonmap") +
                '"><img src="https://cachetur.no/api/img/map.png" style="height:16px;"/></button><button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" title="' +
                i18next.t("menu.fitroute") +
                '"><img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/></button> <span id="cachetur-tur-antall-container">(<span id="cachetur-tur-antall"></span>)</span></li>'
        );
    } else {
        ctPrependToHeader(
            '<li id="cachetur-header"><img src="https://cachetur.net/img/logo_top.png" title="' +
                i18next.t("menu.loggedinas") +
                " " +
                _ctCacheturUser +
                '" /> ' +
                i18next.t("menu.addto") +
                ' <select id="cachetur-tur-valg">' +
                options +
                '</select><button id="cachetur-tur-open" class="cachetur-menu-button" type="button" title="' +
                i18next.t("menu.opentrip") +
                '"><img src="https://cachetur.no/api/img/arrow.png" style="height:16px;"/></button><button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" title="' +
                i18next.t("menu.refresh") +
                '"><img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/></button><button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" title="' +
                i18next.t("menu.showonmap") +
                '"><img src="https://cachetur.no/api/img/map.png" style="height:16px;"/></button><button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" title="' +
                i18next.t("menu.fitroute") +
                '"><img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/></button> <span id="cachetur-tur-antall-container">(<span id="cachetur-tur-antall"></span>)</span></li>'
        );
    }

    let tripSelector = $("#cachetur-tur-valg");
    let storedTrip = GM_getValue("cachetur_selected_trip", 0);

    let storedIsInList = false;
    let selectorOptions = tripSelector.children("option");
    selectorOptions.each(function () {
        if ($(this).val() === storedTrip) {
            storedIsInList = true;
            tripSelector.val($(this).val());
            return false;
        }
    });

    if (!storedIsInList) {
        if (selectorOptions.length > 0) {
            storedTrip = selectorOptions.first().val();
        } else {
            storedTrip = 0;
        }

        GM_setValue("cachetur_selected_trip", storedTrip);
    }

    ctGetAddedCodes(storedTrip);
    ctGetTripRoute(storedTrip);

    tripSelector.change(function () {
        let id = $("#cachetur-tur-valg").val();
        ctGetAddedCodes(id);
        ctGetTripRoute(id);
        GM_setValue("cachetur_selected_trip", id);
        GM_setValue("cachetur_last_action", Date.now());
    });

    $("#cachetur-tur-open").click(function () {
        let selected = $("#cachetur-tur-valg").val();
        let url = "https://cachetur.no/";
        if (selected.endsWith("L"))
            url =
                url + "liste/" + selected.substring(0, selected.length - 1);
        else if (selected.endsWith("T"))
            url =
                url +
                "template/" +
                selected.substring(0, selected.length - 1);
        else url = url + "fellestur/" + selected;

        GM_openInTab(url);
    });

    $("#cachetur-tur-refresh").click(async function () {
        console.log("Refreshing list of trips and data for selected trip");
        let id = $("#cachetur-tur-valg").val();
        $("#cachetur-tur-antall").text("Loading");

        const available = await ctApiCall("planlagt_list_editable", {
            includetemplates: "true",
        });

        let options = "";

        if (available.length > 0) {
            available.forEach(function (item) {
                options =
                    options +
                    '<option value="' +
                    item.id +
                    '">' +
                    item.turnavn +
                    "</option>";
            });
        }

        $("#cachetur-tur-valg").empty().append(options).val(id);

        ctGetAddedCodes(id);
        ctGetTripRoute(id);
        GM_setValue("cachetur_last_action", Date.now());
        console.log(
            "Finished refreshing list of trips and data for selected trip"
        );
    });

    $("#cachetur-tur-add-ct-caches").click(function () {
        console.log("Adding caches from cachetur.no");
        let id = $("#cachetur-tur-valg").val();
        ctAddCacheMarkersToMap(id);
    });

    $("#cachetur-tur-fitbounds").click(function () {
        let unsafeLeafletObject = ctGetUnsafeLeafletObject();
        if (unsafeLeafletObject !== null && unsafeWindow.cacheturRouteLayer)
            unsafeLeafletObject.fitBounds(
                unsafeWindow.cacheturRouteLayer.getBounds()
            );
        if (_ctPageHandler instanceof GC_SearchMapPageHandler) {
            $("#clear-map-control").trigger("click");
        }
    });
    console.log("Inside ctCreateTripList, ending");
}

async function ctGetAddedCodes(id) {
    const codes = await ctApiCall("planlagt_get_codes", {
        tur: id,
        useid: false,
    });
    if (codes.length <= 0) return;

    _ctCodesAdded = [];

    codes.forEach(function (item) {
        _ctCodesAdded.push(item);
    });

    ctUpdateAddImage();
    ctPGCMarkFound();
    ctPGCCheckVgps();
    ctCheckList();

    $("#cachetur-tur-antall").html(_ctCodesAdded.length);
}

async function ctGetTripRoute(id) {
    if (!id || id.endsWith("L")) {
        $("#cachetur-tur-fitbounds").prop("disabled", true);
        return;
    }

    let unsafeLeafletObject = ctGetUnsafeLeafletObject();
    if (unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop("disabled", true);
        $("#cachetur-tur-add-ct-caches").prop("disabled", true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    if (unsafeWindow.cacheturCacheLayer) {
        unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
    }

    console.log("Attempting to fetch route for selected trip");

    const routeData = await ctApiCall("planlagt_get_route", {
        tur: id,
    });
    if (unsafeWindow.cacheturRouteLayer) {
        unsafeLeafletObject.removeLayer(unsafeWindow.cacheturRouteLayer);
    }

    if (routeData.length <= 0) {
        console.log("Couldn't find any route for given trip/list");
        $("#cachetur-tur-fitbounds").prop("disabled", true);
        return;
    }

    console.log("Route data received, constructing route");

    _routeLayer = L.polyline(routeData, {
        color: "purple",
    });
    _routeLayer.getAttribution = function () {
        return 'Directions powered by <a href="https://www.graphhopper.com/" target="_blank">GraphHopper API</a>, delivered by <a href="https://cachetur.no">cachetur.no</a>';
    };
    unsafeWindow.cacheturRouteLayer = cloneInto(_routeLayer, unsafeWindow);

    console.log("Injecting route");
    unsafeLeafletObject.addLayer(unsafeWindow.cacheturRouteLayer);

    $("#cachetur-tur-fitbounds").prop("disabled", false);
    $("#cachetur-tur-add-ct-caches").prop("disabled", false);

    const waypointData = await ctApiCall("planlagt_get_noncaches", {
        tur: id,
    });
    if (unsafeWindow.cacheturWaypointsLayer) {
        unsafeLeafletObject.removeLayer(
            unsafeWindow.cacheturWaypointsLayer
        );
    }

    if (waypointData.length <= 0) {
        console.log("Couldn't find any waypoints for given trip/list");
        return;
    }

    let markers = [];
    waypointData.forEach(function (item) {
        markers.push(
            L.marker([item.lat, item.lon], {
                icon: L.divIcon({
                    className: "cachetur-map_marker",
                    iconSize: [18, 18],
                    riseOnHover: true,
                    html:
                        '<div class="cachetur-map_marker_symbol " title="' +
                        item.name +
                        '"><img src="' +
                        item.typeicon +
                        '" /></div><span class="label label-default"></span>',
                }),
            })
        );
    });

    _waypointLayer = L.layerGroup(markers);
    unsafeWindow.cacheturWaypointsLayer = cloneInto(
        _waypointLayer,
        unsafeWindow
    );

    console.log("Injecting waypoints");
    unsafeLeafletObject.addLayer(unsafeWindow.cacheturWaypointsLayer);

    $("#cachetur-tur-fitbounds").prop("disabled", false);
    $("#cachetur-tur-add-ct-caches").prop("disabled", false);
}

async function ctAddCacheMarkersToMap(id) {
    console.log("Attempting to fetch cache coordinates for selected trip");

    let unsafeLeafletObject = ctGetUnsafeLeafletObject();
    if (unsafeLeafletObject === null) {
        $("#cachetur-tur-fitbounds").prop("disabled", true);
        $("#cachetur-tur-add-ct-caches").prop("disabled", true);
        console.log("ERROR: Can't find leaflet object");
        return;
    }

    const cacheData = await ctApiCall("planlagt_get_cachecoordinates", {
        tur: id,
    });
    if (unsafeWindow.cacheturCacheLayer) {
        unsafeLeafletObject.removeLayer(unsafeWindow.cacheturCacheLayer);
    }

    if (cacheData.length <= 0) {
        console.log("Couldn't find any cache data for given trip/list");
        $("#cachetur-tur-fitbounds").prop("disabled", true);
        return;
    }

    console.log("Cache data received, constructing markers");

    let markers = [];
    cacheData.forEach(function (item) {
        markers.push(
            L.marker([item.lat, item.lon], {
                icon: L.divIcon({
                    className: "cachetur-map_marker",
                    iconSize: [18, 18],
                    riseOnHover: true,
                    html:
                        '<div class="cachetur-map_marker_symbol " title="' +
                        item.name +
                        '"><img src="' +
                        item.typeicon +
                        '" /></div><span class="label label-default"></span>',
                }),
            })
        );
    });

    _cacheLayer = L.layerGroup(markers);
    unsafeWindow.cacheturCacheLayer = cloneInto(_cacheLayer, unsafeWindow);

    console.log("Injecting caches");
    unsafeLeafletObject.addLayer(unsafeWindow.cacheturCacheLayer);

    $("#cachetur-tur-fitbounds").prop("disabled", false);
}

async function ctGetPublicLists(cache) {
    const listData = await ctApiCall("cache_get_lists", {
        code: cache,
    });
    if (listData.length <= 0) {
        console.log(
            "Couldn't find any lists or trip templates for the given cache"
        );
        return;
    }

    console.log("Injecting list of lists");
    let alternate = false;
    let listHtml =
        '<div class="CacheDetailNavigationWidget"><h3 class="WidgetHeader"><img src="https://cachetur.no/api/img/cachetur-15.png" /> Cachetur.no</h3><div class="WidgetBody"><ul class="BookmarkList">';
    listData.forEach(function (list) {
        let listElement =
            '<li class="' +
            (alternate ? "AlternatingRow" : "") +
            '"><a href="https://cachetur.no/' +
            (list.source === "triptemplate"
                ? "tur"
                : list.source === "trip"
                ? "fellestur"
                : "liste") +
            "/" +
            list.id +
            '">' +
            list.name +
            "</a><br>" +
            i18next.t("template.by") +
            " " +
            list.owner +
            "</li>";
        alternate = !alternate;
        listHtml = listHtml + listElement;
    });
    listHtml = listHtml + "</ul></div></div>";

    $(".sidebar").append(listHtml);
}

async function ctGetPublicLists_gc_map_new(cache) {
    const listData = await ctApiCall("cache_get_lists", {
        code: cache,
    });
    if (listData.length <= 0) {
        console.log(
            "Couldn't find any lists or trip templates for the given cache"
        );
        return;
    }

    console.log("Injecting list of lists to geocache " + cache);
    let alternate = false;
    let listHtml =
        '<div class="cachetur-controls-container"><h3 class="WidgetHeader"><img src="https://cachetur.no/api/img/cachetur-15.png" /> Cachetur.no</h3><div class="WidgetBody"><h5>' +
        i18next.t("lists.in") +
        "</h5>";
    listData.forEach(function (list) {
        let listElement =
            '<li class="' +
            (alternate ? "AlternatingRow" : "") +
            '"><a href="https://cachetur.no/' +
            (list.source === "triptemplate"
                ? "tur"
                : list.source === "trip"
                ? "fellestur"
                : "liste") +
            "/" +
            list.id +
            '">' +
            list.name +
            "</a><br>" +
            i18next.t("template.by") +
            " " +
            list.owner +
            "</li>";
        alternate = !alternate;
        listHtml = listHtml + listElement;
    });
    listHtml = listHtml + "</ul></div></div>";

    $(".cache-preview-action-menu").prepend(listHtml);
}

//TODO: ctPage easy?
function ctGetUnsafeLeafletObject() {
    if (_ctPage === "gc_map" && unsafeWindow.MapSettings) {
        return unsafeWindow.MapSettings.Map;
    } else if (_ctPage === "gc_map_new" && unsafeWindow.cacheturGCMap) {
        return unsafeWindow.cacheturGCMap;
    } else if (_ctPage === "gsak" && unsafeWindow.map) {
        return unsafeWindow.map;
    } else if (_ctPage === "gc_geotour" && unsafeWindow.cacheturGCMap) {
        return unsafeWindow.cacheturGCMap;
    } else if (_ctPage === "bobil" && unsafeWindow.map) {
        return unsafeWindow.map;
    } else if (_ctPage === "pgc_map" && unsafeWindow.PGC_LiveMap) {
        return unsafeWindow.PGC_LiveMap.map;
    } else if (
        _ctPage === "pgc_map" &&
        unsafeWindow.freeDraw &&
        unsafeWindow.freeDraw.map
    ) {
        return unsafeWindow.freeDraw.map;
    } else {
        return null;
    }
}

async function ctInitAddLinks() {
    if (_ctCacheturUser === "") return;
    console.log("Inside ctInitAddLinks, starting");
    //TODO: ctPage
    switch (_ctPage) {
        case "gc_geocache":
            ctAddToCoordInfoLink(
                $(
                    "#ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode"
                )
            );
            break;
        case "gc_bmlist":
            ctAddSendListButton();
            break;
        case "gc_map":
            $("#form1").bind("DOMSubtreeModified", ctMapBindToDOMChanges);
            if (
                document.querySelector(
                    "script[src*='//maps.googleapis.com/']"
                )
            ) {
                await waitForElement(".map-cta");
                $(".map-wrapper").append(
                    '<large style="color: red; position: absolute; top: 62px; right: 25px;">' +
                        i18next.t("alerts.google") +
                        "</large>"
                );
                return;
            }
            break;
        case "gc_map_new":
            if (
                document.querySelector(
                    "script async[src*='maps.googleapis.com/maps-api-v3']"
                )
            ) {
                console.log("google map");
                await waitForElement("#clear-map-control");
                $(".map-container").append(
                    '<large style="color: red; position: absolute; top: 62px; right: 25px;">' +
                        i18next.t("alerts.google") +
                        "</large>"
                );
                break;
            }
            if (!document.querySelector("primary log-geocache"))
                ctWatchNewMap();

            break;
        case "gc_geotour":
            $("#map_container").bind(
                "DOMSubtreeModified",
                ctMapBindToDOMChanges
            );
            break;
        case "gsak":
            await waitForElement("#map");
            ctgsakMapInit();
            ctWatchgsakMap();

            break;
        case "pgc_map":
            await waitForElement("#map");
            ctPGCMapInit();
            break;
        case "pgc_vgps":
            ctAddSendPgcVgpsButton();
            break;
    }
    console.log("Inside ctInitAddLinks, ending");
}

function ctWatchgsakMap() {
    console.log("start mutationobserver");
    let targetNode = document.body;
    let config = {
        attributes: true,
        childList: true,
        subtree: true,
    };
    let callback = function (mutationsList, observer) {
        if (document.getElementsByClassName("a").length === 0) {
            return;
        }
        let cacheCode = document.getElementsByClassName("a").text;

        if (cacheCode === _ctNewMapActiveCache) {
            return;
        }
        _ctNewMapActiveCache = cacheCode;
        $(".cachetur-add-code").data("code", cacheCode);
        ctAddToCoordInfoLink($(".cache-metadata-code"));
        ctUpdateAddImage();
    };

    let observer = new MutationObserver(callback);
    observer.observe(targetNode, config);

    $("body").on("click", ".cachetur-add-code", async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code,
        });
        if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);
        } else {
            if (_ctPage === "gc_geocache") {
                //TODO: ctPage
                img.addClass("cachetur-add-code-error");
            } else if (_ctPage === "gc_map") {
                //TODO: ctPage
                img.html(
                    '<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' +
                        i18next.t("send")
                );
            } else {
                img.attr(
                    "src",
                    "https://cachetur.no/api/img/cachetur-15-error.png"
                );
            }
        }
    });
}

function ctWatchNewMap() {
    console.log("start mutationobserver");
    let targetNode = document.body;
    let config = {
        attributes: true,
        childList: true,
        subtree: true,
    };
    let callback = function (mutationsList, observer) {
        if (
            document.getElementsByClassName("primary log-geocache")
                .length === 0
        ) {
            return;
        }
        let cacheCode = document.getElementsByClassName(
            "cache-metadata-code"
        )[0].innerText;

        if (cacheCode === _ctNewMapActiveCache) {
            return;
        }
        _ctNewMapActiveCache = cacheCode;
        $(".cachetur-add-code").data("code", cacheCode);
        ctAddToCoordInfoLink($(".cache-metadata-code"));
        ctUpdateAddImage();
    };

    let observer = new MutationObserver(callback);
    observer.observe(targetNode, config);

    $("body").on("click", ".cachetur-add-code", async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code,
        });
        if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);
        } else {
            if (_ctPage === "gc_geocache") {
                //TODO: ctPage
                img.addClass("cachetur-add-code-error");
            } else if (_ctPage === "gc_map") {
                //TODO: ctPage
                img.html(
                    '<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' +
                        i18next.t("send")
                );
            } else {
                img.attr(
                    "src",
                    "https://cachetur.no/api/img/cachetur-15-error.png"
                );
            }
        }
    });
}

//TODO: ctPage
function ctInitPGCLiveMapListener() {
    if (
        _ctPage !== "pgc_map" ||
        window.location.pathname.indexOf("/Tools/LiveMap") === -1
    )
        return;

    ctPGCMapInit();

    console.log("Initializing PGC Live Map layeradd-listener");

    let map = ctGetUnsafeLeafletObject();
    if (map === null) return;

    map.on("layeradd", function (layer) {
        setTimeout(ctPGCCheckAndMarkLayer.bind(null, layer), 50);
    });
}

function ctPgcMapBindToChanges() {
    if ($("#map").length) {
        let popup = $(".leaflet-popup-content").children().last();

        if (popup.length !== _ctLastCount) {
            _ctLastCount = popup.length;

            ctAddToVGPSLink(popup);
        }
    }
}

//TODO: ctPage
function ctInitgsakMapListener() {
    if (
        _ctPage !== "gsak" ||
        window.location.pathname.indexOf("/html/") === -1
    )
        return;

    ctgsakMapInit();

    console.log("Initializing gsak listener");

    let map = ctGetUnsafeLeafletObject();
    if (map === null) return;

    map.on("layeradd", function (layer) {
        setTimeout(ctgsakCheckAndMarkLayer.bind(null, layer), 50);
    });
}

function ctgsakMapBindToChanges() {
    if ($("#map").length) {
        let popup = $(".leaflet-popup-content").children().last();

        if (popup.length !== _ctLastCount) {
            _ctLastCount = popup.length;

            ctAddTogsakLink(popup);
        }
    }
}

function ctMapBindToDOMChanges() {
    let codes = $(".code");

    if (codes.length !== _ctLastCount) {
        _ctLastCount = codes.length;

        codes.each(function () {
            ctAddToCoordInfoLink($(this));
        });
    }
}

function ctAddToCoordInfoLink(code) {
    if (!code.hasClass("cachetur-add")) {
        let gcCode = code.html();
        let img =
            '<img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
            i18next.t("send") +
            '" class="cachetur-add-code" style="cursor: pointer;" data-code="' +
            gcCode +
            '" /> ';

        if (_ctPage === "gc_geocache") {
            //TODO: ctPage
            console.log("injecting cachetur menus to geocaches");
            code = $(
                "#ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode"
            );
            ctGetPublicLists(gcCode);
            $(".CacheDetailNavigation").append(
                '<ul id="cachetur-controls-container"><li><a href class="cachetur-add-code" style="cursor: pointer;" data-code="' +
                    gcCode +
                    '">' +
                    i18next.t("send") +
                    "</a></li></ul>"
            );
        } else if (_ctPage === "gc_map") {
            //TODO: ctPage
            let img =
                '<a href class="cachetur-add-code" style="cursor: pointer;" data-code="' +
                gcCode +
                '"><img src="https://cachetur.no/api/img/cachetur-15.png" /> ' +
                i18next.t("send") +
                "</a>";
            code.parent().append(
                '<div class="links Clear cachetur-controls-container">' +
                    img +
                    "</div>"
            );
        } else if (_ctPage === "gc_map_new") {
            //TODO: ctPage
            console.log("injecting cachetur menus to geocache " + gcCode);
            code = ".cache-metadata-code";
            $(".cache-preview-action-menu").prepend(
                '<br><ul id="cachetur-controls-container"><li><img src="https://cachetur.no/api/img/cachetur-15.png" /><a href class="cachetur-add-code" style="cursor: pointer;" data-code="' +
                    gcCode +
                    '"> ' +
                    i18next.t("send") +
                    "</a></li></ul>"
            );
            ctGetPublicLists_gc_map_new(gcCode);
        } else {
            code.prepend(img);
        }
        if (_ctPage === "gc_map_new") {
            // TODO: ctPage
            $(".cache-metadata-code").addClass("cachetur-add");
        } else {
            code.addClass("cachetur-add");
        }

        ctUpdateAddImage();
    }

    $(".cachetur-add-code").click(async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");

        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code,
        });
        if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);
        } else {
            if (_ctPage === "gc_geocache") {
                //TODO: ctPage
                img.addClass("cachetur-add-code-error");
            } else if (_ctPage === "gc_map_new") {
                //TODO: ctPage
                img.addClass("cachetur-add-code-error");
            } else if (_ctPage === "gc_map") {
                //TODO: ctPage
                img.html(
                    '<img src="https://cachetur.no/api/img/cachetur-15-error.png" /> ' +
                        i18next.t("send")
                );
            } else {
                img.attr(
                    "src",
                    "https://cachetur.no/api/img/cachetur-15-error.png"
                );
            }
        }

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctAddTogsakLink(gsak) {
    if (!gsak.hasClass("cachetur-add")) {
        let cacheLink = gsak.parent().find("a")[0];
        if (!cacheLink) return;
        let gcCode = gsak.parent().find("a").text();
        console.log("Gsak kode " + gcCode);

        gsak.parent().prepend(
            '<img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
                i18next.t("send") +
                '" class="cachetur-add-code" style="cursor: pointer; left:20px;" data-code="' +
                gcCode +
                '" /> '
        );
        if (window.location.pathname.indexOf("/html/") === -1) {
            gsak.parent().find("a")[1].remove();
        }
        gsak.addClass("cachetur-add");

        ctUpdateAddImage();
    }

    $(".cachetur-add-code").click(async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code,
        });
        if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);
        } else {
            img.attr(
                "src",
                "https://cachetur.no/api/img/cachetur-15-error.png"
            );
        }

        GM_setValue("cachetur_last_action", Date.now());
    });
}

//fake update posted coordinates
async function updatecoord() {
    await waitForElement("#cachetur-tur-valg");
    if (_ctPage === "gc_geocache") {
        //TODO: ctPage
        $(".LocationData").append(
            '<span class="cachetur-header" span id="copy"> <button id="cp_btn" title="' +
                i18next.t("corrected.title") +
                '"><img src="https://raw.githubusercontent.com/cghove/bobil/main/l1515.png">' +
                i18next.t("corrected.button") +
                '<img src="https://raw.githubusercontent.com/cghove/bobil/main/1515.png"></button> </span>'
        );
        document
            .getElementById("cp_btn")
            .addEventListener("click", clipboard);

        async function clipboard() {
            event.preventDefault();
            var text = $("#uxLatLon").text();
            var $temp = $("<input>");
            $("body").append($temp);
            $temp.val(text).select();
            document.execCommand("copy");
            $temp.remove();
            $("#uxLatLon").trigger("click");
            await waitForElement("#newCoordinates"); // TODO: Maybe working?
            $("#newCoordinates").val(text);
            $(".btn-cc-parse").trigger("click");
        }
    }
}

//end fake update posted coordinates

function ctAddToVGPSLink(vgps) {
    if (!vgps.hasClass("cachetur-add")) {
        let cacheLink = vgps.parent().find("a")[0];
        if (!cacheLink) return;
        let gcCode = vgps.parent().find("a")[0].href.split(".info/")[1];
        console.log("pgc kode " + gcCode);
        vgps.parent().prepend(
            '<img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
                i18next.t("send") +
                '" class="cachetur-add-code" style="cursor: pointer; left:20px;" data-code="' +
                gcCode +
                '" /> '
        );
        if (window.location.pathname.indexOf("/Tools/LiveMap") === -1) {
            vgps.parent().find("a")[1].remove();
        }
        vgps.addClass("cachetur-add");

        ctUpdateAddImage();
    }

    $(".cachetur-add-code").click(async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let img = $(this);
        let code = img.data("code");
        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: code,
        });
        if (data === "Ok") {
            _ctCodesAdded.push(code);
            ctUpdateAddImage(true);
            $("#cachetur-tur-antall").html(_ctCodesAdded.length);
        } else {
            img.attr(
                "src",
                "https://cachetur.no/api/img/cachetur-15-error.png"
            );
        }

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctAddSendPgcVgpsButton() {
    let container = $("#vgps_newList").parent();
    container.append(
        '<button  type="button" class="btn btn-default btn-xs cachetur-send-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
            i18next.t("send") +
            '" style="cursor: pointer;" /> ' +
            i18next.t("vgps.sendmarked") +
            "</button> "
    );
    container.append(
        '<button  type="button" class="btn btn-default btn-xs cachetur-select-vgps"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
            i18next.t("vgps.markfromtrip") +
            '" style="cursor: pointer;" /> ' +
            i18next.t("vgps.markfromtrip") +
            "</button> "
    );

    $(".cachetur-send-vgps").click(function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        ctPGCSendVGPSSelected();
    });

    $(".cachetur-select-vgps").click(function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        ctPGCSelectVGPS();
    });
}

async function ctPGCSendVGPSSelected() {
    let selected = $("#vgpsTable")
        .find(".jqgrow.ui-row-ltr.ui-widget-content.ui-state-highlight")
        .find("[aria-describedby*='vgpsTable_gccode']")
        .find("a")
        .toArray();

    if (selected.length === 0) {
        return;
    }

    let tur = $("#cachetur-tur-valg").val();
    let codes = [];
    selected.forEach(function (item) {
        codes.push(item.text);
    });

    const data = await ctApiCall("planlagt_add_codes", {
        tur: tur,
        code: codes,
    });
    if (data === "Ok") {
        ctGetAddedCodes(tur);
        ctGetTripRoute(tur);
        alert(i18next.t("vgps.sent"));
    } else {
        alert(i18next.t("vgps.error"));
    }

    GM_setValue("cachetur_last_action", Date.now());
}

function ctPGCSelectVGPS() {
    let inCachetur = $(".cachetur-pgc-added").closest("tr").toArray();

    if (inCachetur.length === 0) {
        return;
    }

    inCachetur.forEach(function (item) {
        $("#jqg_vgpsTable_" + item.id)
            .prop("checked", true)
            .trigger("click");
    });
}

function ctPGCMarkFound() {
    if (_ctPage !== "pgc_map") return; //TODO: ctPage

    let map = ctGetUnsafeLeafletObject();
    if (map === null) return;

    map.eachLayer(function (layer) {
        ctPGCCheckAndMarkLayer(layer);
    });
}

function ctPGCCheckAndMarkLayer(layer) {
    let realLayer = layer.layer ? layer.layer : layer;

    if (realLayer instanceof L.Marker && realLayer.label) {
        let cacheCode = realLayer.label._content.split(" - ")[0];
        if (ctCodeAlreadyAdded(cacheCode)) {
            realLayer._icon.classList.add("cachetur-marker-added");
        } else {
            realLayer._icon.classList.remove("cachetur-marker-added");
        }
    }
}

function ctgsakCheckAndMarkLayer(layer) {
    let realLayer = layer.layer ? layer.layer : layer;

    if (realLayer instanceof L.Marker && realLayer.label) {
        let cacheCode = realLayer.label._content.split(" - ")[0];
        if (ctCodeAlreadyAdded(cacheCode)) {
            realLayer._icon.classList.add("cachetur-marker-added");
        } else {
            realLayer._icon.classList.remove("cachetur-marker-added");
        }
    }
}

function ctPGCCheckVgps() {
    if (_ctPage !== "pgc_vgps") return; //TODO: ctPage

    $(".cachetur-pgc-added").remove();

    $("#vgpsTable")
        .find(".jqgrow.ui-row-ltr.ui-widget-content")
        .each(function () {
            let code = $(this)
                .find("[aria-describedby*='vgpsTable_gccode']")
                .find("a")
                .html();
            if (ctCodeAlreadyAdded(code)) {
                $(this)
                    .find("[aria-describedby*='vgpsTable_name']")
                    .prepend(
                        '<img class="cachetur-pgc-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="' +
                            i18next.t("sent") +
                            '"> '
                    );
            }
        });
}

async function ctAddSendListButton() {
    await waitForElement(".multi-select-action-bar");
    console.log("Injecting send to cachetur button");
    $(".multi-select-action-bar-count-section").after(
        '<button type="button" class="cachetur-send-bmlist gc-button multi-select-action-bar-button gc-button-has-type gc-button-primary" style="margin-left: 5px;"><img src="https://cachetur.no/api/img/cachetur-15.png" title="' +
            i18next.t("send") +
            '" style="cursor: pointer;" /> ' +
            i18next.t("vgps.sendmarked") +
            "</button> "
    );

    $(".cachetur-send-bmlist").click(function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        ctListSendSelected();
    });
}

async function ctListSendSelected() {
    let selected = $(
        '.geocache-table tbody tr input[type="checkbox"]:checked'
    )
        .closest("tr")
        .find(".geocache-code");

    if (selected.length > 0) {
        let tur = $("#cachetur-tur-valg").val();
        let codes = [];

        selected.each(function (index) {
            codes.push($(this).text().split("|")[1].trim());
        });

        const data = await ctApiCall("planlagt_add_codes", {
            tur: tur,
            code: codes,
        });
        if (data === "Ok") {
            ctGetAddedCodes(tur);
            ctGetTripRoute(tur);
            alert(i18next.t("vgps.sent"));
        } else {
            alert(i18next.t("vgps.error"));
        }

        GM_setValue("cachetur_last_action", Date.now());
    }
}

async function ctCheckList() {
    if (_ctPage !== "gc_bmlist") return; //TODO: ctPage

    await waitForElement(".geocache-table");
    $(".cachetur-bmlist-added").remove();

    $("table.geocache-table")
        .find("tr")
        .each(function () {
            let codeInfo = $(this).find(".geocache-code").text().split("|");
            if (codeInfo.length > 1) {
                let code = codeInfo[1].trim();
                if (ctCodeAlreadyAdded(code)) {
                    $(this)
                        .find(".geocache-code")
                        .prepend(
                            '<img class="cachetur-bmlist-added" src="https://cachetur.no/api/img/cachetur-15-success.png" title="' +
                                i18next.t("sent") +
                                '"> '
                        );
                }
            }
        });
}

//TODO: ctPage a lot
function ctUpdateAddImage(codeAddedTo) {
    ctPGCMarkFound();

    let imgs = $(".cachetur-add-code");
    if (imgs.length <= 0) return;

    imgs.each(function () {
        let img = $(this);
        let code = img.data("code");

        let codeIsAdded = codeAddedTo === code || ctCodeAlreadyAdded(code);

        ctSetIconForCode(code);

        if (codeIsAdded) {
            if (_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-error");
                img.addClass("cachetur-add-code-success");
                img.html(i18next.t("sent"));
            } else if (_ctPage === "gc_map_new") {
                img.html(
                    '<img src="https://cachetur.no/api/img/cachetur-15-success.png" /> ' +
                        i18next.t("sent")
                );
            } else if (_ctPage === "gc_map") {
                img.html(
                    '<img src="https://cachetur.no/api/img/cachetur-15-success.png" /> ' +
                        i18next.t("sent")
                );
            } else {
                img.attr(
                    "src",
                    "https://cachetur.no/api/img/cachetur-15-success.png"
                );
                img.attr("title", i18next.t("sent"));
            }
            if (
                img.parent().parent().find(".cachetur-add-comment").length >
                0
            )
                return;

            let style = "padding-right: 5px;";
            if (_ctPage === "pgc_map") {
                style = "left: 60px;";
            }

            let commentControl;
            if (_ctPage === "gc_geocache") {
                let li = $("<li></li>");
                commentControl = $(
                    '<a href class="cachetur-add-comment" data-code="' +
                        code +
                        '">' +
                        i18next.t("comments.add") +
                        "</a>"
                );
                li.append(commentControl);
                $("#cachetur-controls-container").append(li);
            } else if (_ctPage === "gc_map_new") {
                let li = $("<li></li>");
                commentControl = $(
                    '<a href class="cachetur-add-comment" data-code="' +
                        code +
                        '"><img src="https://cachetur.no/api/img/cachetur-comment.png" /> ' +
                        i18next.t("comments.add") +
                        " </a>"
                );
                img.parent().append(commentControl);
                li.append(commentControl);
                $("#cachetur-controls-container").append(li);
            } else if (_ctPage === "gc_map") {
                commentControl = $(
                    '<a href class="cachetur-add-comment" data-code="' +
                        code +
                        '"><img src="https://cachetur.no/api/img/cachetur-comment.png" /> ' +
                        i18next.t("comments.add") +
                        " </a>"
                );
                img.parent().append(commentControl);
            } else {
                commentControl = $(
                    ' <img src="https://cachetur.no/api/img/cachetur-comment.png" data-code="' +
                        code +
                        '" title="' +
                        i18next.t("comments.add") +
                        '" class="cachetur-add-comment" style="cursor: pointer; ' +
                        style +
                        '" /> '
                );
                img.parent().prepend(commentControl);
            }

            commentControl.click(async function (evt) {
                evt.stopImmediatePropagation();
                evt.preventDefault();

                let tur = $("#cachetur-tur-valg").val();
                let commentImg = $(this);
                let commentCode = commentImg.data("code");
                let comment = prompt(i18next.t("comments.description"));

                const data = await ctApiCall("planlagt_add_code_comment", {
                    tur: tur,
                    code: commentCode,
                    comment: comment,
                });
                if (data === "Ok") {
                    if (_ctPage === "gc_geocache") {
                        commentImg.addClass("cachetur-add-comment-success");
                        commentImg.html(i18next.t("comments.saved"));
                    } else if (_ctPage === "gc_map_new") {
                        commentImg.html(
                            '<img src="https://cachetur.no/api/img/cachetur-comment-success.png" /> ' +
                                i18next.t("comments.saved")
                        );
                    } else if (_ctPage === "gc_map") {
                        commentImg.html(
                            '<img src="https://cachetur.no/api/img/cachetur-comment-success.png" /> ' +
                                i18next.t("comments.saved")
                        );
                    } else {
                        commentImg.attr(
                            "src",
                            "https://cachetur.no/api/img/cachetur-comment-success.png"
                        );
                        commentImg.attr(
                            "title",
                            i18next.t("comments.saved")
                        );
                    }
                } else {
                    if (_ctPage === "gc_geocache") {
                        commentImg.addClass("cachetur-add-comment-error");
                        commentImg.html(i18next.t("comments.error"));
                    } else if (_ctPage === "gc_map_new") {
                        commentImg.html(
                            '<img src="https://cachetur.no/api/img/cachetur-comment-error.png" /> ' +
                                i18next.t("comments.error")
                        );
                    } else if (_ctPage === "gc_map") {
                        commentImg.html(
                            '<img src="https://cachetur.no/api/img/cachetur-comment-error.png" /> ' +
                                i18next.t("comments.error")
                        );
                    } else {
                        commentImg.attr(
                            "src",
                            "https://cachetur.no/api/img/cachetur-comment-error.png"
                        );
                        commentImg.attr(
                            "title",
                            i18next.t("comments.error")
                        );
                    }
                }

                GM_setValue("cachetur_last_action", Date.now());
            });

            if (!$("#cachetur-tur-valg").val().endsWith("T")) {
                ctCreatePriorityControl(img, code, 1);
                ctCreatePriorityControl(img, code, 2);
                ctCreatePriorityControl(img, code, 3);
            }
        } else {
            if (_ctPage === "gc_geocache") {
                img.removeClass("cachetur-add-code-success")
                    .removeClass("cachetur-add-code-error")
                    .html(i18next.t("send"));
                img.parent()
                    .parent()
                    .find(".cachetur-add-comment")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-1")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-2")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-3")
                    .parent()
                    .remove();
                $("#cachetur-found-by-container").remove();
            } else if (_ctPage === "gc_map_new") {
                img.removeClass("cachetur-add-code-success")
                    .removeClass("cachetur-add-code-error")
                    .html(i18next.t("send"));
                img.parent()
                    .parent()
                    .find(".cachetur-add-comment")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-1")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-2")
                    .parent()
                    .remove();
                img.parent()
                    .parent()
                    .find(".cachetur-set-pri-3")
                    .parent()
                    .remove();
            } else if (_ctPage === "gc_map") {
                img.html(
                    '<img src="https://cachetur.no/api/cachetur-15.png" /> ' +
                        i18next.t("send")
                );
                img.parent().find(".cachetur-add-comment").remove();
                img.parent().find(".cachetur-set-pri-1").remove();
                img.parent().find(".cachetur-set-pri-2").remove();
                img.parent().find(".cachetur-set-pri-3").remove();
                img.parent().find(".cachetur-found-by").remove();
            } else {
                img.attr(
                    "src",
                    "https://cachetur.no/api/img/cachetur-15.png"
                );
                img.attr("title", i18next.t("send"));
                img.parent().find(".cachetur-add-comment").remove();
                img.parent().find(".cachetur-set-pri-1").remove();
                img.parent().find(".cachetur-set-pri-2").remove();
                img.parent().find(".cachetur-set-pri-3").remove();
                img.parent().find(".cachetur-found-by").remove();
            }
        }
    });
}

//TODO: ctPage a lot
function ctCreatePriorityControl(img, code, priority) {
    let control;
    let style = "padding-right: 5px;";

    if (_ctPage === "pgc_map") {
        let left = 60 + priority * 20;
        style = "left: " + left + "px";
    }

    if (_ctPage === "gc_geocache") {
        let li = $("<li></li>");
        control = $(
            '<a href class="cachetur-set-pri-' +
                priority +
                '" data-code="' +
                code +
                '">' +
                i18next.t("priority.set" + priority) +
                "</a>"
        );
        li.append(control);
        $("#cachetur-controls-container").append(li);
    } else if (_ctPage === "gc_map_new") {
        let li = $("<li></li>").insertAfter(".cachetur-add-comment");
        control = $(
            '<a href class="cachetur-set-pri-' +
                priority +
                '" data-code="' +
                code +
                '"><img src="https://cachetur.no/api/img/p' +
                priority +
                '.png" /> ' +
                i18next.t("priority.set" + priority) +
                "</a>"
        );
        li.append(control);
        $("#cachetur-controls-container").append(li);
    } else if (_ctPage === "gc_map") {
        control = $(
            '<a href class="cachetur-set-pri-' +
                priority +
                '" data-code="' +
                code +
                '"><img src="https://cachetur.no/api/img/p' +
                priority +
                '.png" /> ' +
                i18next.t("priority.set" + priority) +
                "</a>"
        );
        img.parent().append(control);
    } else {
        control = $(
            ' <img src="https://cachetur.no/api/img/p' +
                priority +
                '.png" data-code="' +
                code +
                '" title="' +
                i18next.t("priority.set" + priority) +
                '" class="cachetur-set-pri-' +
                priority +
                '" style="cursor: pointer; ' +
                style +
                '" /> '
        );
        img.parent().prepend(control);
    }

    control.click(async function (evt) {
        evt.stopImmediatePropagation();
        evt.preventDefault();

        let tur = $("#cachetur-tur-valg").val();
        let priorityImg = $(this);
        let priorityCode = priorityImg.data("code");

        const data = await ctApiCall("planlagt_set_code_priority", {
            tur: tur,
            code: priorityCode,
            priority: priority,
        });
        if (data === "Ok") {
            if (_ctPage === "gc_geocache") {
                priorityImg.addClass(
                    "cachetur-set-pri-" + priority + "-success"
                );
                priorityImg.html(i18next.t("priority.saved"));
            } else if (_ctPage === "gc_map_new") {
                priorityImg.addClass(
                    "cachetur-set-pri-" + priority + "-success"
                );
                priorityImg.html(i18next.t("priority.saved"));
            } else if (_ctPage === "gc_map") {
                priorityImg.html(
                    '<img src="https://cachetur.no/api/img/p' +
                        priority +
                        '_success.png" /> ' +
                        i18next.t("priority.saved")
                );
            } else {
                priorityImg.attr(
                    "src",
                    "https://cachetur.no/api/img/p" +
                        priority +
                        "_success.png"
                );
                priorityImg.attr("title", i18next.t("priority.saved"));
            }
        } else {
            if (_ctPage === "gc_geocache") {
                priorityImg.addClass(
                    "cachetur-set-pri-" + priority + "-error"
                );
                priorityImg.html(i18next.t("priority.error"));
            } else if (_ctPage === "gc_map_new") {
                priorityImg.addClass(
                    "cachetur-set-pri-" + priority + "-error"
                );
                priorityImg.html(i18next.t("priority.error"));
            } else if (_ctPage === "gc_map") {
                priorityImg.html(
                    '<img src="https://cachetur.no/api/img/p' +
                        priority +
                        '_error.png" /> ' +
                        i18next.t("priority.error")
                );
            } else {
                priorityImg.attr(
                    "src",
                    "https://cachetur.no/api/img/p" +
                        priority +
                        "_error.png"
                );
                priorityImg.attr("title", i18next.t("priority.error"));
            }
        }

        GM_setValue("cachetur_last_action", Date.now());
    });
}

function ctCodeAlreadyAdded(code) {
    return _ctCodesAdded.indexOf(code) > -1;
}

async function ctSetIconForCode(code) {
    let id = $("#cachetur-tur-valg").val();

    const foundBy = await ctApiCall("planlagt_check_find", {
        tur: id,
        code: code,
    });
    if (foundBy === "") return "";

    let img = $(".cachetur-add-code[data-code='" + code + "']");
    if (img.length <= 0) return;

    if ($(".cachetur-found-by[data-code='" + code + "']").length === 0) {
        let style = "";
        if (_ctPage === "pgc_map") {
            //TODO: ctPage
            style = "left: 40px;";
        }
        if (_ctPage === "gc_geocache") {
            //TODO: ctPage
            $("#cachetur-found-by-container").remove();
            $("#cachetur-controls-container")
                .parent()
                .append(
                    '<ul id="cachetur-found-by-container"><li><b><img src="https://cachetur.no/api/img/attfind.png" /> ' +
                        i18next.t("foundby") +
                        "</b></li><li>" +
                        foundBy +
                        "</li></ul>"
                );
        } else if (_ctPage === "gc_map_new") {
            //TODO: ctPage
            $("#cachetur-found-by-container").remove();
            $("#cachetur-controls-container")
                .parent()
                .append(
                    '<ul id="cachetur-found-by-container"><li><b><img src="https://cachetur.no/api/img/attfind.png" /> ' +
                        i18next.t("foundby") +
                        "</b></li><li>" +
                        foundBy +
                        "</li></ul>"
                );
        } else if (_ctPage === "gc_map") {
            //TODO: ctPage
            img.closest(".map-item")
                .find(".cachetur-found-by-container")
                .remove();
            img.closest(".map-item").append(
                '<div class="links Clear cachetur-found-by-container"><b><img src="https://cachetur.no/api/img/attfind.png" /> ' +
                    i18next.t("foundby") +
                    "</b> " +
                    foundBy +
                    "</div>"
            );
        } else {
            img.parent().prepend(
                ' <img class="cachetur-found-by" data-code="' +
                    code +
                    '" src="https://cachetur.no/api/img/attfind.png" title="' +
                    i18next.t("foundby") +
                    " " +
                    foundBy +
                    '" style="' +
                    style +
                    '" /> '
            );
        }
    }
}
// Get url parameter.
function getURLParam(key) {
    var query = window.location.search.substring(1);
    var pairs = query.split("&");
    for (let i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split("=");
        if (pair[0] == key) {
            if (pair[1].length > 0) return pair[1];
        }
    }
    return undefined;
}
function ctFixNewGcMapIssues() {
    if (window.location.href.indexOf("bm=") > -1) return;

    unsafeWindow.cacheturGCMap.on("zoomend", function () {
        var latHighG = false;
        var latLowG = false;
        var lngHighG = false;
        var lngLowG = false;
        var firstRun = true;
        const ONE_MINUTE_MS = 60 * 1000;
        function searchThisArea(waitCount) {
            if (
                $(".leaflet-gl-layer.mapboxgl-map")[0] ||
                $("div.gm-style")[0]
            ) {
                // Leaflet or GM
                if (
                    !$(".loading-container.show")[0] &&
                    !$("li.active svg.my-lists-toggle-icon")[0] &&
                    $("#clear-map-control")[0] &&
                    firstRun
                ) {
                    setTimeout(function () {
                        if ($(".loading-container.show")[0]) return;
                        var pxHeight = window.innerHeight;
                        var pxWidth = window.innerWidth;
                        var lat = parseFloat(getURLParam("lat"));
                        var lng = parseFloat(getURLParam("lng"));
                        var zoom = parseInt(getURLParam("zoom"));
                        var metersPerPx =
                            (156543.03392 *
                                Math.cos((lat * Math.PI) / 180)) /
                            Math.pow(2, zoom);
                        var latMeterDistance = metersPerPx * pxHeight;
                        var lngMeterDistance = metersPerPx * pxWidth;
                        var latHalfDezDistance =
                            latMeterDistance / 1850 / 60 / 2;
                        var lngHalfDezDistance =
                            lngMeterDistance /
                            (1850 * Math.cos((lat * Math.PI) / 180)) /
                            60 /
                            2;
                        var latHigh = (lat + latHalfDezDistance).toFixed(4);
                        var latLow = (lat - latHalfDezDistance).toFixed(4);
                        var lngHigh = (lng + lngHalfDezDistance).toFixed(4);
                        var lngLow = (lng - lngHalfDezDistance).toFixed(4);
                        if (
                            latHighG == false ||
                            latHigh > latHighG ||
                            latLow < latLowG ||
                            lngHigh > lngHighG ||
                            lngLow < lngLowG
                        ) {
                            latHighG = latHigh;
                            latLowG = latLow;
                            lngHighG = lngHigh;
                            lngLowG = lngLow;
                            if (!firstRun) {
                                let times = JSON.parse(
                                    GM_getValue(
                                        "search_this_area_times",
                                        "[]"
                                    )
                                );
                                if (times.length < 9) {
                                    $("#clear-map-control").click().click();
                                    times.push(Date.now());
                                    GM_setValue(
                                        "search_this_area_times",
                                        JSON.stringify(times)
                                    );
                                } else {
                                    let t = Date.now();
                                    // check 1min limit
                                    if (t - times[0] > ONE_MINUTE_MS) {
                                        $("#clear-map-control")
                                            .click()
                                            .click();
                                        times.splice(0, 1);
                                        times.push(t);
                                        GM_setValue(
                                            "search_this_area_times",
                                            JSON.stringify(times)
                                        );
                                    } else {
                                        if (
                                            $("body.cta-waiting-msg")
                                                .length === 0
                                        ) {
                                            $("body").addClass(
                                                "cta-waiting-msg"
                                            );
                                            var wait = Math.ceil(
                                                (ONE_MINUTE_MS -
                                                    (t - times[0])) /
                                                    1000
                                            );
                                            function countdown(waitTime) {
                                                if (waitTime < 1) {
                                                    $(
                                                        "#cta-waiting-msg"
                                                    ).remove();
                                                    $(
                                                        "div.loading-container"
                                                    )
                                                        .css(
                                                            "display",
                                                            "none"
                                                        )
                                                        .removeClass(
                                                            "show"
                                                        );
                                                    $("body").removeClass(
                                                        "cta-waiting-msg"
                                                    );
                                                } else {
                                                    $(
                                                        "div.loading-container"
                                                    )
                                                        .css(
                                                            "display",
                                                            "flex"
                                                        )
                                                        .addClass("show");
                                                    $(
                                                        "#cta-waiting-msg"
                                                    ).remove();
                                                    $(
                                                        ".loading-display"
                                                    ).append(
                                                        '<span id="cta-waiting-msg" role="alert" aria-live="assertive">' +
                                                            i18next.t(
                                                                "refresh.tomany "
                                                            ) +
                                                            " " +
                                                            +waitTime +
                                                            " " +
                                                            i18next.t(
                                                                " refresh.s"
                                                            ) +
                                                            "</span>"
                                                    );

                                                    setTimeout(function () {
                                                        countdown(
                                                            --waitTime
                                                        );
                                                    }, 1000);
                                                }
                                            }
                                            countdown(wait);
                                        }
                                    }
                                }
                            }
                            firstRun = false;
                        }
                    }, 400);
                }
            } else {
                waitCount++;
                if (waitCount <= 200)
                    setTimeout(function () {
                        searchThisArea(waitCount);
                    }, 50);
            }
        }
        window.history.pushState = new Proxy(window.history.pushState, {
            apply: (target, thisArg, argArray) => {
                searchThisArea(0);
                return target.apply(thisArg, argArray);
            },
        });
    });

    unsafeWindow.cacheturGCMap.on("dragend", function () {
        var latHighG = false;
        var latLowG = false;
        var lngHighG = false;
        var lngLowG = false;
        var firstRun = true;
        const ONE_MINUTE_MS = 60 * 1000;
        function searchThisArea(waitCount) {
            if (
                $(".leaflet-gl-layer.mapboxgl-map")[0] ||
                $("div.gm-style")[0]
            ) {
                // Leaflet or GM
                if (
                    !$(".loading-container.show")[0] &&
                    !$("li.active svg.my-lists-toggle-icon")[0] &&
                    ($("#clear-map-control")[0] || firstRun)
                ) {
                    setTimeout(function () {
                        if ($(".loading-container.show")[0]) return;
                        var pxHeight = window.innerHeight;
                        var pxWidth = window.innerWidth;
                        var lat = parseFloat(getURLParam("lat"));
                        var lng = parseFloat(getURLParam("lng"));
                        var zoom = parseInt(getURLParam("zoom"));
                        var metersPerPx =
                            (156543.03392 *
                                Math.cos((lat * Math.PI) / 180)) /
                            Math.pow(2, zoom);
                        var latMeterDistance = metersPerPx * pxHeight;
                        var lngMeterDistance = metersPerPx * pxWidth;
                        var latHalfDezDistance =
                            latMeterDistance / 1850 / 60 / 2;
                        var lngHalfDezDistance =
                            lngMeterDistance /
                            (1850 * Math.cos((lat * Math.PI) / 180)) /
                            60 /
                            2;
                        var latHigh = (lat + latHalfDezDistance).toFixed(4);
                        var latLow = (lat - latHalfDezDistance).toFixed(4);
                        var lngHigh = (lng + lngHalfDezDistance).toFixed(4);
                        var lngLow = (lng - lngHalfDezDistance).toFixed(4);
                        if (
                            latHighG == false ||
                            latHigh > latHighG ||
                            latLow < latLowG ||
                            lngHigh > lngHighG ||
                            lngLow < lngLowG
                        ) {
                            latHighG = latHigh;
                            latLowG = latLow;
                            lngHighG = lngHigh;
                            lngLowG = lngLow;

                            if (!firstRun) {
                                let times = JSON.parse(
                                    GM_getValue(
                                        "search_this_area_times",
                                        "[]"
                                    )
                                );
                                if (times.length < 9) {
                                    $("#clear-map-control").click().click();
                                    times.push(Date.now());
                                    GM_setValue(
                                        "search_this_area_times",
                                        JSON.stringify(times)
                                    );
                                } else {
                                    let t = Date.now();
                                    if (t - times[0] > ONE_MINUTE_MS) {
                                        $("#clear-map-control")
                                            .click()
                                            .click();
                                        times.splice(0, 1);
                                        times.push(t);
                                        GM_setValue(
                                            "search_this_area_times",
                                            JSON.stringify(times)
                                        );
                                    } else {
                                        if (
                                            $("body.cta-waiting-msg")
                                                .length === 0
                                        ) {
                                            $("body").addClass(
                                                "cta-waiting-msg"
                                            );
                                            var wait = Math.ceil(
                                                (ONE_MINUTE_MS -
                                                    (t - times[0])) /
                                                    1000
                                            );
                                            function countdown(waitTime) {
                                                if (waitTime < 1) {
                                                    $(
                                                        "#cta-waiting-msg"
                                                    ).remove();
                                                    $(
                                                        "div.loading-container"
                                                    )
                                                        .css(
                                                            "display",
                                                            "none"
                                                        )
                                                        .removeClass(
                                                            "show"
                                                        );
                                                    $("body").removeClass(
                                                        "cta-waiting-msg"
                                                    );
                                                } else {
                                                    $(
                                                        "div.loading-container"
                                                    )
                                                        .css(
                                                            "display",
                                                            "flex"
                                                        )
                                                        .addClass("show");
                                                    $(
                                                        "#cta-waiting-msg"
                                                    ).remove();
                                                    $(
                                                        ".loading-display"
                                                    ).append(
                                                        '<span id="cta-waiting-msg" role="alert" aria-live="assertive">' +
                                                            i18next.t(
                                                                "refresh.tomany"
                                                            ) +
                                                            " " +
                                                            waitTime +
                                                            " " +
                                                            i18next.t(
                                                                "refresh.s"
                                                            ) +
                                                            "</span>"
                                                    );

                                                    setTimeout(function () {
                                                        countdown(
                                                            --waitTime
                                                        );
                                                    }, 1000);
                                                }
                                            }
                                            countdown(wait);
                                        }
                                    }
                                }
                            }
                            firstRun = false;
                        }
                    }, 400);
                }
            } else {
                waitCount++;
                if (waitCount <= 200)
                    setTimeout(function () {
                        searchThisArea(waitCount);
                    }, 50);
            }
        }
        window.history.pushState = new Proxy(window.history.pushState, {
            apply: (target, thisArg, argArray) => {
                searchThisArea(0);
                return target.apply(thisArg, argArray);
            },
        });
    });
}


// Add D/T info on a cache page

/*
Fork of Geocaching - Add D/T info on a cache page.
By Francois Crevola

Copyright (c) 2014-2018, Francois Crevola
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

async function tvinfo() {
    if (_ctPage === "gc_geocache") {
        //TODO: ctPage
        var resultDifficultyTerrainCaches = "";

        GM_xmlhttpRequest({
            method: "GET",
            url: "http://www.geocaching.com/my/statistics.aspx",
            onload: function (response) {
                obj = $.parseHTML(response.responseText);
                resultDifficultyTerrainCaches = $(obj).find(
                    "#DifficultyTerrainCaches"
                );

                D = $("#ctl00_ContentBody_uxLegendScale").html();
                D = D.substring(
                    D.indexOf("stars/stars") + 11,
                    D.indexOf(".gif")
                );
                D = D.replace("_", ".");

                T = $("#ctl00_ContentBody_Localize12").html();
                T = T.substring(
                    T.indexOf("stars/stars") + 11,
                    T.indexOf(".gif")
                );
                T = T.replace("_", ".");

                var nbDT = "0";
                if (resultDifficultyTerrainCaches !== "") {
                    nbDT = resultDifficultyTerrainCaches
                        .find(
                            "#" +
                                ((D - 1) * 2 + 1) +
                                "_" +
                                ((T - 1) * 2 + 1)
                        )
                        .text();
                }

                if (nbDT != "0") {
                    $("#ctl00_ContentBody_diffTerr").before(
                        "<div> " +
                            i18next.t("dt.you") +
                            "   " +
                            nbDT +
                            " " +
                            i18next.t("dt.caches") +
                            "</div><br>"
                    );
                } else {
                    $("#ctl00_ContentBody_diffTerr").before(
                        "<div><strong>" +
                            i18next.t("dt.new") +
                            "</strong></p></div><br>"
                    );
                    $("#ctl00_ContentBody_uxLegendScale").attr(
                        "style",
                        "background-color: lightgreen"
                    );
                    $("#ctl00_ContentBody_Localize12").attr(
                        "style",
                        "background-color: lightgreen"
                    );
                }
            },
        });
    } else if (_ctPage === "gc_map_new") {
        //TODO: ctPage
        if (
            $("#GClh_II_running")[0] &&
            $("gclh_nav#ctl00_gcNavigation")[0]
        ) {
            const delay = (n) =>
                new Promise((r) => setTimeout(r, n * 2000));
        }
        await waitForElement(".cache-preview-attributes");
        var resultDifficultyTerrainCaches = "";
        GM_xmlhttpRequest({
            method: "GET",
            url: "http://www.geocaching.com/my/statistics.aspx",
            onload: function (response) {
                obj = $.parseHTML(response.responseText);
                resultDifficultyTerrainCaches = $(obj).find(
                    "#DifficultyTerrainCaches"
                );
                var D =
                    document.querySelectorAll(".attribute-val")[0]
                        .innerHTML;
                D = D.replace(",", ".");

                var T =
                    document.querySelectorAll(".attribute-val")[1]
                        .innerHTML;
                T = T.replace(",", ".");

                var nbDT = "0";
                if (resultDifficultyTerrainCaches !== "") {
                    nbDT = resultDifficultyTerrainCaches
                        .find(
                            "#" +
                                ((D - 1) * 2 + 1) +
                                "_" +
                                ((T - 1) * 2 + 1)
                        )
                        .text();
                }

                if (nbDT != "0") {
                    if (
                        $("#GClh_II_running")[0] &&
                        $("gclh_nav#ctl00_gcNavigation")[0]
                    ) {
                        $("div.cache-preview-action-menu").append(
                            "<div> " +
                                i18next.t("dt.you") +
                                "   " +
                                nbDT +
                                " " +
                                i18next.t("dt.caches") +
                                "</div><br>"
                        );
                    }
                    $("div.header-top").append(
                        "<div> " +
                            i18next.t("dt.you") +
                            "   " +
                            nbDT +
                            " " +
                            i18next.t("dt.caches") +
                            "</div><br>"
                    );
                } else {
                    if (
                        $("#GClh_II_running")[0] &&
                        $("gclh_nav#ctl00_gcNavigation")[0]
                    ) {
                        $("div.cache-preview-action-menu").append(
                            "<div>" + i18next.t("dt.new") + "</div>"
                        );
                    }
                    $("div.header-top").append(
                        "<div>" + i18next.t("dt.new") + "</div>"
                    );
                }
            },
        });
    } else if (_ctPage === "gc_map") {
        //TODO: ctPage
        await waitForElement(".code");
        var resultDifficultyTerrainCaches = "";
        GM_xmlhttpRequest({
            method: "GET",
            url: "http://www.geocaching.com/my/statistics.aspx",
            onload: function (response) {
                obj = $.parseHTML(response.responseText);
                resultDifficultyTerrainCaches = $(obj).find(
                    "#DifficultyTerrainCaches"
                );

                D = document.querySelectorAll("DD")[1].innerHTML;

                D = D.substring(
                    D.indexOf("stars/stars") + 11,
                    D.indexOf(".gif")
                );

                D = D.replace("_", ".");

                T = document.querySelectorAll("DD")[4].innerHTML;

                T = T.substring(
                    T.indexOf("stars/stars") + 11,
                    T.indexOf(".gif")
                );

                T = T.replace("_", ".");

                var nbDT = "0";
                if (resultDifficultyTerrainCaches !== "") {
                    nbDT = resultDifficultyTerrainCaches
                        .find(
                            "#" +
                                ((D - 1) * 2 + 1) +
                                "_" +
                                ((T - 1) * 2 + 1)
                        )
                        .text();
                }

                if (nbDT != "0") {
                    $("#gmCacheInfo").append(
                        "<div>" +
                            i18next.t("dt.you") +
                            " " +
                            nbDT +
                            " " +
                            i18next.t("dt.caches") +
                            "</div>"
                    );
                } else {
                    $("#gmCacheInfo").append(
                        "<div>" + i18next.t("dt.new") + "</div>"
                    );
                }
            },
        });
    } else {
    }
}


// window.onLoad This removes all other listeners on this

window.addEventListener("load", windowLoaded);
async function windowLoaded() {
    console.log("Unbinding to avoid multiple loads");
    window.removeEventListener("load", windowLoaded);

    console.log("Waiting for needed elements defined in page handlers");
    await _ctPageHandler.waitForNeededElements();
    console.log("Page handler has everything to allow init");

    console.log("Running in " + _ctPageHandler.get_ctID() + " mode");


    // TODO: Fix this
    if (_ctPage === "gc_map_new") {
        console.log(
            "Doing dirty trick to take over Geocaching.com's leaflet object"
        );
        if (unsafeWindow.gcMap) {
            unsafeWindow.cacheturGCMap = unsafeWindow.gcMap;
        } else {
            let originalLMap = L.Map;
            L.Map = function (div, settings) {
                unsafeWindow.cacheturGCMap = new originalLMap(div, settings);
                L.Map = originalLMap;
                ctFixNewGcMapIssues();
                unsafeWindow.gcMap = unsafeWindow.cacheturGCMap;
                return unsafeWindow.cacheturGCMap;
            };
        }
    }

    await loadTranslations();

    debugger;
    ctStart();
    ctStartmenu();
}
