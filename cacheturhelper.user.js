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

let _mapInfo = {
    latHighPrev : false,
    latLowPrev : false,
    lngHighPrev : false,
    lngLowPrev : false,
    firstRun : true
}
const ONE_MINUTE_MS = 60 * 1000;

// trailing debounce, thanks zspec
function debounce(func, wait) {
    let timeoutId;
    return function debounced(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(func.bind(this), wait, ...args);
    };
  }

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
    userElement;

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
            
            .cachetur-header-text {
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
    }

    ctInitInactive() {
        console.log("Adding style Inactive");
        GM_addStyle(
            `#cachetur-header {
                padding: 8px 1em 22px 2em;
            }
            
            .cachetur-header-text {
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

    getUserElements() {
        if (this.getUserSelector() == "") {
            return [];
        }
        if (this.userElement) {
            return this.userElement;
        }
        this.userElement = document.querySelectorAll(this.getUserSelector());
        if (this.userElement) {
            return this.userElement;
        }
        throw Error(
            "Header element:" + this.getHeaderSelector() + " not found"
        );
    }

    getHeaderSelector() {
        throw Error("Not implemented");
    }

    getUserSelector() {
        throw Error("Not implemented");
    }

    getUnsafeLeafletObject() {
        return null;
    }

    async initAddLinks() {
        throw Error("Not implemented");
    }

    addCacheturToCacheMenu(elem, gcCode) {
        const img =
        `<img src="https://cachetur.no/api/img/cachetur-15.png"
                title="${i18next.t("send")}"
                class="cachetur-add-code"
                style="cursor: pointer;"
                data-code="${gcCode}" />`;
        elem.prepend(img);
        elem.addClass("cachetur-add");
    }

    addCacheToListError(img) {
        img.setAttribute("src", "https://cachetur.no/api/img/cachetur-15-error.png")
    }

    initLiveMapListener() {
        return;
    }

    updateCacheIsAdded(img) {
        img.attr(
            "src",
            "https://cachetur.no/api/img/cachetur-15-success.png"
        );
        img.attr("title", i18next.t("sent"));
    }

    addCommentControl(img, code, style) {
        const commentControl = HTMLStringToElement(`
            <img src="https://cachetur.no/api/img/cachetur-comment.png"
                    data-code="${code}" title="${i18next.t("comments.add")}"
                    class="cachetur-add-comment"
                    style="cursor: pointer; ${style}" />`);
        img.parentElement.prepend(commentControl);
        return commentControl;
    }

    addCommentSuccess(commentImg) {
        commentImg.setAttribute("src", "https://cachetur.no/api/img/cachetur-comment-success.png");
        commentImg.setAttribute("title", i18next.t("comments.saved"));
    }

    addCommentError(commentImg) {
        commentImg.setAttribute("src", "https://cachetur.no/api/img/cachetur-comment-error.png");
        commentImg.setAttribute("title", i18next.t("comments.error"));
    }

    addNotInListControl(img) {
        img.setAttribute("src", "https://cachetur.no/api/img/cachetur-15.png");
        img.setAttribute("title", i18next.t("send"));
        img.parentElement.querySelector(".cachetur-add-comment").remove();
        img.parentElement.querySelector(".cachetur-set-pri-1").remove();
        img.parentElement.querySelector(".cachetur-set-pri-2").remove();
        img.parentElement.querySelector(".cachetur-set-pri-3").remove();
        img.parentElement.querySelector(".cachetur-found-by").remove();
    }

    addPriorityControl(img, code, priority, style) {
        const control = HTMLStringToElement(`
            <img src="https://cachetur.no/api/img/p${priority}.png"
                    data-code="${code}" data-priority="${priority}"
                    title="${i18next.t("priority.set" + priority)}"
                    class="cachetur-set-pri-${priority}"
                    style="cursor: pointer; ${style}" />`);
        img.parentElement.prepend(control);
        return control;
    }

    setPrioritySuccess(priorityImg, priority) {
        priorityImg.setAttribute("src",`https://cachetur.no/api/img/p${priority}_success.png`);
        priorityImg.setAttribute("title", i18next.t("priority.saved"));
    }

    setPriorityError(priorityImg, priority) {
        priorityImg.setAttribute("src",`https://cachetur.no/api/img/p${priority}_error.png`);
        priorityImg.setAttribute("title", i18next.t("priority.error"));
    }

    setIconForCode(imgElems, foundBy, code, style) {
        const elem = HTMLStringToElement(`
            <img class="cachetur-found-by" data-code="${code}"
                src="https://cachetur.no/api/img/attfind.png"
                title="${i18next.t("foundby")} ${foundBy}"
                style="${style}" />`);
        imgElems.parentElement.prepend(elem);
    }

    getCurrentCacheDT() {
        throw Error("Not implemented");
    }

    addDTstat(nbDT) {
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

    getHeaderSelector() {
        return ".user-menu";
    }

    getUserSelector() {
        return "span.username";
    }

    async initAddLinks() {
        const elem = document.getElementById("ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode");
        ctAddToCoordInfoLink(elem);
    }

    addCacheturToCacheMenu(elem, gcCode) {
        console.log("injecting cachetur menus to geocaches");
        elem = document.getElementById("ctl00_ContentBody_CoordInfoLinkControl1_uxCoordInfoCode");
        ctGetPublicLists(gcCode);
        
        const stringElem = `
            <ul id="cachetur-controls-container">
                <li>
                    <a href class="cachetur-add-code"
                       style="cursor: pointer;"
                       data-code="${gcCode}">
                            ${i18next.t("send")}
                    </a>
                </li>
            </ul>`;

        const elemToAdd = HTMLStringToElement(stringElem);
        const elements = document.getElementsByClassName("CacheDetailNavigation");
        for (const item of elements) {
            item.appendChild(elemToAdd);
        }
        elem.addClass("cachetur-add");
    }

    addCacheToListError(img) {
        for (const item of img) {
            item.addClass("cachetur-add-code-error");
        }
    }

    updateCacheIsAdded(img) {
        img.classList.remove("cachetur-add-code-error");
        img.classList.add("cachetur-add-code-success");
        img.innerHTML = i18next.t("sent");
    }

    addCommentControl(img, code) {
        const toAdd = HTMLStringToElement(`
            <li>
                <a href class="cachetur-add-comment" data-code="${code}">
                    ${i18next.t("comments.add")}
                </a>
            </li>`);
        document.getElementById("cachetur-controls-container").append(toAdd);
        return toAdd;
    }

    addCommentSuccess(commentImg) {
        commentImg.classList.add("cachetur-add-comment-success");
        comment.img.innerHTML = i18next.t("comments.saved");
    }

    addCommentError(commentImg) {
        commentImg.classList.add("cachetur-add-comment-error");
        commentImg.innerHTML = i18next.t("comments.error");
    }

    addNotInListControl(img) {
        img.classList.remove("cachetur-add-code-success", "cachetur-add-code-error");
        img.innerHTML = i18next.t("send");
        img.parentElement.parentElement.querySelector(".cachetur-add-comment").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-1").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-2").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-3").parentElement.remove();
        document.getElementById("cachetur-found-by-container").remove();
    }

    addPriorityControl(img, code, priority, style) {
        const control = HTMLStringToElement(`
            <a href class="cachetur-set-pri-${priority}"
                data-code="${code}" data-priority="${priority}">
                    ${i18next.t("priority.set" + priority)}
            </a>`);
        
        const li = HTMLStringToElement(`<li></li>`);
        li.append(control);
        document.getElementById("cachetur-controls-containter").append(li);
        return control;
    }

    setPrioritySuccess(priorityImg, priority) {
        priorityImg.classList.add(`cachetur-set-pri-${priority}-success`);
        priorityImg.innerHTML = i18next.t("priority.saved");
    }

    setPriorityError(priorityImg, priority) {
        priorityImg.classList.add(`cachetur-set-pri-${priority}-error`);
        priorityImg.innerHTML = i18next.t("priority.error");
    }

    setIconForCode(imgElems, foundBy, code, style) {
        document.getElementById("cachetur-found-by-container").remove();
        const elem = HTMLStringToElement(`
            <ul id="cachetur-found-by-container">
                <li>
                    <b>
                        <img src="https://cachetur.no/api/img/attfind.png" />
                        ${i18next.t("foundby")}
                    </b>
                </li>
                <li>
                    ${foundBy}
                </li>
            </ul>`);
        
        document.getElementById("cachetur-controls-container").parentElement.append(elem);
    }

    getCurrentCacheDT() {
        const DHTML = document.getElementById("ctl00_ContentBody_uxLegendScale").innerHTML;
        let D = DHTML.substring(DHTML.indexOf("stars/stars") + 11, DHTML.indexOf(".gif"));
        D.replace("_", ".");

        const THTML = document.getElementById("ctl00_ContentBody_Localize12").innerHTML;
        let T = THTML.substring(THTML.indexOf("stars/stars") + 11, THTML.indexOf(".gif"));
        T.replace("_", ".");

        return {"D": D, "T": T};
    }

    addDTstat(nbDT) {
        if (nbDT === "0") {
            document.getElementById("ctl00_ContentBody_diffTerr").before(
                HTMLStringToElement(`
                    <div>
                        <strong>
                            ${i18next.t("dt.new")}
                        </strong>
                        </p>
                    </div>
                    <br>`));

            document.getElementById("ctl00_ContentBody_uxLegendScale").style.background = "lightgreen";
            document.getElementById("ctl00_ContentBody_Localize12").style.background = "lightgreen";
        } else {
            document.getElementById("ctl00_ContentBody_diffTerr").before(
                HTMLStringToElement(`
                    <div>
                        ${i18next.t("dt.you")} ${nbDT} ${i18next.t("dt.caches")}
                    </div>
                    <br>`));
        }
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

    getHeaderSelector() {
        return ".user-menu";
    }
    
    getUserSelector() {
        return "span.username";
    }

    getUnsafeLeafletObject() {
        return unsafeWindow.MapSettings?.Map;
    }

    async initAddLinks() {
        const formElement = document.getElementById("form1");
        const observer = new MutationObserver(ctMapBindToDOMChanges);
        observer.observe(formElement, {childList: true, subtree: true});
        if (document.querySelector("script[src*='//maps.googleapis.com/']")) {
            await waitForElement(".map-cta");
            const stringAlert = `
                <large style="color: red; position: absolute; top: 62px; right: 25px;">
                    ${i18next.t("alerts.google")}
                </large>`;
            const elemAlert = HTMLStringToElement(stringAlert);
            const elems = document.getElementsByClassName("map-wrapper");
            for (const elem of elems) {
                elem.append(elemAlert);
            }
        }
    }

    addCacheturToCacheMenu(elem, gcCode) {
        const stringElem = `
            <div class="links Clear cachetur-controls-container">
                <a href class="cachetur-add-code"
                    style="cursor: pointer;"
                    data-code="${gcCode}">
                        <img src="https://cachetur.no/api/img/cachetur-15.png" />
                        ${i18next.t("send")}
                </a>
            </div>`;
        const elemToAdd = HTMLStringToElement(stringElem);
        elem.parenNode.append(elemToAdd);
        elem.addClass("cachetur-add");
    }

    addCacheToListError(img) {
        img[0]?.innerHTML = `<img src="https://cachetur.no/api/img/cachetur-15-error.png" />${i18next.t("send")}`
    }

    updateCacheIsAdded(img) {
        img.innerHTML = `
            <img src="https://cachetur.no/api/img/cachetur-15-success.png" />
            ${i18next.t("sent")}`;
    }

    addCommentControl(img, code) {
        const commentControl = HTMLStringToElement(`
            <a href class="cachetur-add-comment" data-code="${code}">
                <img src="https://cachetur.no/api/img/cachetur-comment.png" />
                ${i18next.t("comments.add")}
            </a>`);
        img.parentElement.append(commentControl);
        return commentControl;
    }

    addCommentSuccess(commentImg) {
        commentImg.innerHTML = `
            <img src="https://cachetur.no/api/img/cachetur-comment-success.png" />
                ${i18next.t("comments.saved")}`;
    }

    addCommentError(commentImg) {
        commentImg.html(
            '<img src="https://cachetur.no/api/img/cachetur-comment-error.png" /> ' +
                i18next.t("comments.error")
        );
    }

    addNotInListControl(img) {
        img.innerHTML = `<img src="https://cachetur.no/api/cachetur-15.png" />
                                ${i18next.t("send")}`;
        img.parentElement.querySelector(".cachetur-add-comment").remove();
        img.parentElement.querySelector(".cachetur-set-pri-1").remove();
        img.parentElement.querySelector(".cachetur-set-pri-2").remove();
        img.parentElement.querySelector(".cachetur-set-pri-3").remove();
        img.parentElement.querySelector(".cachetur-found-by").remove();
    }

    addPriorityControl(img, code, priority, style) {
        const control = HTMLStringToElement(`
            <a href class="cachetur-set-pri-${priority}"
                data-code="${code}" data-priority="${priority}">
                <img src="https://cachetur.no/api/img/p${priority}.png" />
                ${i18next.t("priority.set" + priority)}
            </a>`);
        
        img.parentElement.append(control);
        return control;
    }

    setPrioritySuccess(priorityImg, priority) {
        priorityImg.innerHTML = `
            <img src="https://cachetur.no/api/img/p${priority}_success.png" />
            ${i18next.t("priority.saved")}`;
    }

    setPriorityError(priorityImg, priority) {
        priorityImg.innerHTML = `
            <img src="https://cachetur.no/api/img/p${priority}_error.png" />
            ${i18next.t("priority.error")}`;
    }

    setIconForCode(imgElems, foundBy, code, style) {
        const mapItem = imgElems.closest(".map-item");
        const elems = mapItem.querySelectorAll(".cachetur-found-by-container");
        for (const elem of elems) {
            elem.remove();
        }
        const toAdd = HTMLStringToElement(`
            <div class="links Clear cachetur-found-by-container">
                <b>
                    <img src="https://cachetur.no/api/img/attfind.png" />
                    ${i18next.t("foundby")} +
                </b>
                ${foundBy}
            </div>`);
        mapItem.append(toAdd);
    }

    getCurrentCacheDT() {
        const DTElems = document.querySelectorAll("DD");
        const DHTML = DTElems[1].innerHTML;
        let D = DHTML.substring(DHTML.indexOf("stars/stars") + 11, DHTML.indexOf(".gif"));
        D.replace("_", ".");

        const THTML = DTElems[4].innerHTML;
        let T = THTML.substring(THTML.indexOf("stars/stars") + 11, THTML.indexOf(".gif"));
        T.replace("_", ".");

        return {"D": D, "T": T};
    }

    addDTstat(nbDT) {
        if (nbDT === "0") {
            document.getElementById("gmCacheInfo").append(
                HTMLStringToElement(`
                    <div>
                        ${i18next.t("dt.new")}
                    </div>`));
        } else {
            document.getElementById("gmCacheInfo").append(
                HTMLStringToElement(`
                    <div>
                        ${i18next.t("dt.you")} ${nbDT} ${i18next.t("dt.caches")}
                    </div>`));
        }
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

    getHeaderSelector() {
        return ".user-menu";
    }
    
    getUserSelector() {
        return "span.username";
    }

    getUnsafeLeafletObject() {
        return unsafeWindow.cacheturGCMap;
    }

    async initAddLinks() {
        if (document.querySelector("script async[src*='maps.googleapis.com/maps-api-v3']")) {
            console.log("google map found");
            await waitForElement("#clear-map-control");
            
            const stringAlert = `
                <large style="color: red; position: absolute; top: 62px; right: 25px;">
                    ${i18next.t("alerts.google")}
                </large>`;
            const elemAlert = HTMLStringToElement(stringAlert);
            const elems = document.getElementsByClassName("map-container");
            for (const elem of elems) {
                elem.append(elemAlert);
            }
        }
        if (!document.querySelector("primary log-geocache"))
            ctWatchNewMap();
    }

    addCacheturToCacheMenu(elem, gcCode) {
        console.log("injecting cachetur menus to geocache " + gcCode);
        const stringElem = `
            <br>
            <ul id="cachetur-controls-container">
                <li>
                    <img src="https://cachetur.no/api/img/cachetur-15.png" />
                    <a href class="cachetur-add-code"
                        style="cursor: pointer;"
                        data-code="${gcCode}">
                            ${i18next.t("send")}
                    </a>
                </li>
            </ul>`;
        const elemToAdd = HTMLStringToElement(stringElem);
        const elements = document.getElementsByClassName("cache-preview-action-menu");
        for(const item of elements) {
            item.prepend(elemToAdd);
        }
        ctGetPublicLists_gc_map_new(gcCode);

        const metadataElements = document.getElementsByClassName("cache-metadata-code");
        for(const item of metadataElements) {
            item.addClass("cachetur-add");
        }
    }

    addCacheToListError(img) {
        for (const item of img) {
            item.addClass("cachetur-add-code-error");
        }
    }

    updateCacheIsAdded(img) {
        img.innerHTML = `
            <img src="https://cachetur.no/api/img/cachetur-15-success.png" />
            ${i18next.t("sent")}`;
    }

    addCommentControl(img, code) {
        const commentControl = HTMLStringToElement(`
            <a href class="cachetur-add-comment" data-code="${code}">
                <img src="https://cachetur.no/api/img/cachetur-comment.png" />
                ${i18next.t("comments.add")}
            </a>
        `);
        const li = HTMLStringToElement(`<li></li>`);
        img.parentElement.append(commentControl);
        li.append(commentControl);
        document.getElementById("cachetur-controls-container").append(li);
        return commentControl;
    }

    addCommentSuccess(commentImg) {
        commentImg.innerHTML = `
            <img src="https://cachetur.no/api/img/cachetur-comment-success.png" />
                ${i18next.t("comments.saved")}`;
    }

    addCommentError(commentImg) {
        commentImg.html(
            '<img src="https://cachetur.no/api/img/cachetur-comment-error.png" /> ' +
                i18next.t("comments.error")
        );
    }

    addNotInListControl(img) {
        img.classList.remove("cachetur-add-code-success", "cachetur-add-code-error");
        img.innerHTML = i18next.t("send");
        img.parentElement.parentElement.querySelector(".cachetur-add-coment").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-1").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-2").parentElement.remove();
        img.parentElement.parentElement.querySelector(".cachetur-set-pri-3").parentElement.remove();
    }

    addPriorityControl(img, code, priority, style) {
        const control = HTMLStringToElement(`
            <a href class="cachetur-set-pri-${priority}"
                data-code="${code}" data-priority="${priority}">
                <img src="https://cachetur.no/api/img/p${priority}.png" />
                ${i18next.t("priority.set" + priority)} +
            </a>`);
        
        const li = HTMLStringToElement(`<li></li>`);
        const elems = document.querySelectorAll(".cachetur-add-comment");
        for (const elem of elems) {
            elem.after(li);
        }

        li.append(control);
        document.getElementById("cachetur-controls-containter").append(li);
        return control;
    }

    setPrioritySuccess(priorityImg, priority) {
        priorityImg.classList.add(`cachetur-set-pri-${priority}-success`);
        priorityImg.innerHTML = i18next.t("priority.saved");
    }

    setPriorityError(priorityImg, priority) {
        priorityImg.classList.add(`cachetur-set-pri-${priority}-error`);
        priorityImg.innerHTML = i18next.t("priority.error");
    }

    setIconForCode(imgElems, foundBy, code, style) {
        document.getElementById("cachetur-found-by-container").remove();
        const toAdd = HTMLStringToElement(`
            <ul id="cachetur-found-by-container">
                <li>
                    <b>
                        <img src="https://cachetur.no/api/img/attfind.png" />
                        ${i18next.t("foundby")}
                    </b>
                </li>
                <li>
                    ${foundBy}
                </li>
            </ul>`);
        document.getElementById("cachetur-controls-container").parentElement.append(toAdd);
    }

    getCurrentCacheDT() {
        const DTElems = document.querySelectorAll(".attribute-val");
        let D = DTElems[0].innerHTML;
        D.replace(",", ".");

        let T = DTElems[1].innerHTML;
        T.replace(",", ".");

        return {"D": D, "T": T};
    }

    addDTstat(nbDT) {
        if (nbDT === "0") {
            if (document.getElementById("GClh_II_running") &&
                document.querySelector("gclh_nav#ctl00_gcNavigation")) {
                    const elems = document.querySelectorAll("div.cache-preview-action-menu")
                    for (const elem of elems) {
                        elem.append(HTMLStringToElement(`
                            <div>
                                ${i18next.t("dt.new")}
                            </div>`));
                    }
            }
            document.querySelector("div.header-top").append(
                HTMLStringToElement(`
                    <div>
                        ${i18next.t("dt.new")}
                    </div>`));
        } else {
            if (document.getElementById("GClh_II_running") &&
                document.querySelector("gclh_nav#ctl00_gcNavigation")) {
                    const elems = document.querySelectorAll("div.cache-preview-action-menu")
                    for (const elem of elems) {
                        elem.append(HTMLStringToElement(`
                            <div>
                                ${i18next.t("dt.you")} ${nbDT} ${i18next.t("dt.caches")}
                            </div>
                            <br>`));
                    }
            }
            document.querySelector("div.header-top").append(
                HTMLStringToElement(`
                    <div>
                        ${i18next.t("dt.you")} ${nbDT} ${i18next.t("dt.caches")}
                    </div>
                    <br>`));
        }
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

    getHeaderSelector() {
        return ".user-menu";
    }
    
    getUserSelector() {
        return "span.username";
    }

    async initAddLinks() {
        ctAddSendListButton();
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

    getHeaderSelector() {
        return ".user-menu";
    }
    
    getUserSelector() {
        return "span.username";
    }

    getUnsafeLeafletObject() {
        return unsafeWindow.cacheturGCMap;
    }

    async initAddLinks() {
        const formElement = document.getElementById("map_container");
        const observer = new MutationObserver(ctMapBindToDOMChanges);
        observer.observe(formElement, {childList: true, subtree: true});
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

    getHeaderSelector() {
        return "#pgcMainMenu ul.navbar-right";
    }

    async initAddLinks() {
        ctAddSendPgcVgpsButton();
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

    getHeaderSelector() {
        return "#pgcMainMenu ul.navbar-right";
    }

    getUnsafeLeafletObject() {
        if (unsafeWindow.PGC_LiveMap) {
            return unsafeWindow.PGC_LiveMap.map;
        }
        if (unsafeWindow.freeDraw) {
            return unsafeWindow.freeDraw.map;
        }
    }

    async initAddLinks() {
        await waitForElement("#map");
        ctPGCMapInit();
    }

    onLayerAdd(layer) {
        setTimeout(ctCheckAndMarkLayer, 50, layer);
    }

    initLiveMapListener() {
        if (window.location.pathname.indexOf("/Tools/LiveMap") === -1) {
            return;
        }
    
        ctPGCMapInit();
    
        console.log("Initializing PGC Live Map layeradd-listener");
    
        const map = _ctPageHandler.getUnsafeLeafletObject();
        if (!map) {
            return;
        }
    
        map.addEventListener("layeradd", this.onLayerAdd);
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

    getHeaderSelector() {
        return ".leaflet-control-scale";
    }

    getUnsafeLeafletObject() {
        return unsafeWindow.map;
    }

    async initAddLinks() {
        await waitForElement("#map");
        ctgsakMapInit();
        ctWatchgsakMap();
    }

    onLayerAdd(layer) {
        setTimeout(ctCheckAndMarkLayer, 50, layer);
    }

    initLiveMapListener() {
        if (window.location.pathname.indexOf("/html/") === -1) {
            return;
        }
    
        ctgsakMapInit();
    
        console.log("Initializing gsak listener");
    
        const map = _ctPageHandler.getUnsafeLeafletObject();
        if (!map) {
            return;
        }
    
        map.addEventListener("layeradd", this.onLayerAdd);
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

    getHeaderSelector() {
        return ".navbar-right";
    }

    getUnsafeLeafletObject() {
        return unsafeWindow.map;
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
            const cardRules = data.split("\n");
            const randomgorgon = Math.floor(Math.random() * cardRules.length);
            const randomNamegorgon = cardRules[randomgorgon];
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
            const cardRules = data.split("\n");
            const randomthomfre = Math.floor(
                Math.random() * cardRules.length
            );
            const randomNamethomfre = cardRules[randomthomfre];
            ctPrependTousergclh(
                '<li id="cachetur-header"><span class="cachetur-header-text">' +
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
            const cardRules = data.split("\n");
            const randomthomfre = Math.floor(
                Math.random() * cardRules.length
            );
            const randomNamethomfre = cardRules[randomthomfre];

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
        ctCheckLogin();
    }
}

async function ctCheckLogin() {
    console.log("Checking login");
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
    if ($("#GClh_II_running")[0] && $("gclh_nav#ctl00_gcNavigation")[0]) { // TODO: Re-visit and clean it more
        if (ambassadorNames.includes(_ctCacheturUser))
            ctPrependTousergclh(
                `<li id="cachetur-header1">
                    <span class="cachetur-header-text">
                        Ambassador
                </li>`
            );
        if (_ctCacheturUser === "thomfre") thomfre1();
    } else {
        if (ambassadorNames.includes(_ctCacheturUser))
            ctPrependToUser(
                `<span class="cachetur-header-text">
                    <img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" />
                    Ambassador
                </span>`
            );
        if (_ctCacheturUser === "thomfre") thomfre();
    }
    if (_ctCacheturUser === "GorgonVaktmester") gorgon();
    
    console.log("Login OK");
    ctInit();
}

async function ctInvalidateLogin() {
    _ctCacheturUser = "";
    const element = await waitForElement("#cachetur-header");
    element.remove();
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

async function ctInit() {
    debugger;
    if (_initialized) return;
    console.log("Initializing Cacheturassistenten");
    ctCreateTripList();
    await _ctPageHandler.InitAddLinks();
    _ctPageHandler.initLiveMapListener();
    _initialized = true;
    console.log("Initialization completed");
}

async function ctInitNotLoggedIn() {
    if (_initialized) return;
    _ctPageHandler.ctInitNotLoggedIn();

    const dataToPrepend =   `<li id="cachetur-header">
                                <span class="cachetur-header-text">
                                    <a href="https://cachetur.no/" target="_blank">
                                        <img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" />
                                        ${i18next.t("menu.notloggedin")}
                                        <br>
                                        ${i18next.t("menu.deactivated")}
                                    </a>
                                </span>
                            </li>`

    ctPrependToHeader(dataToPrepend);
    _initialized = true;
}

async function ctInitInactive() {
    debugger;
    if (_initialized) return;
    console.log("Assistant not being actively used, disabling");
    _ctPageHandler.ctInitInactive();

    const dataToPrepend =   `<li id="cachetur-header">
                                <span class="cachetur-header-text">
                                    <img src="https://cachetur.net/img/logo_top.png" alt="cachetur.no" />
                                    <a href id="cachetur-activate">
                                        ${i18next.t("activate.button")}
                                    </a>
                                </span>
                            </li>`


    ctPrependToHeader(dataToPrepend);
    const btnActivate = await waitForElement("#cachetur-activate");

    btnActivate.addEventListener("click", () => {
        GM_setValue("cachetur_last_action", Date.now());
    });

    _initialized = true;
}

async function ctgsakMapInit() {
    const map = await waitForElement("#map");

    const observer = new MutationObserver(ctgsakMapBindToChanges);
    observer.observe(map, {childList: true, subtree: true});

    const storedTrip = GM_getValue("cachetur_selected_trip", 0);
    ctGetAddedCodes(storedTrip);
    ctGetShowTripData(storedTrip);
}

async function ctPGCMapInit() {
    console.log("Continuing initialization - PGC Live Map mode");
    const map = await waitForElement("#map");

    const observer = new MutationObserver(ctPgcMapBindToChanges);
    observer.observe(map, {childList: true, subtree: true});

    let storedTrip = GM_getValue("cachetur_selected_trip", 0);
    ctGetAddedCodes(storedTrip);
    ctGetShowTripData(storedTrip);
}

function ctPrependToHeader(data) {
    console.log("Injecting cachetur.no in menu");
    const header = _ctPageHandler.getHeaderElement();

    if (header) {
        const element = HTMLStringToElement(data);
        header.prepend(element);
    }
}

function ctPrependToUser(data) {
    // Only GC web page
    const headers = _ctPageHandler.getUserElements();
    for (const elem of headers) {
        elem.after(data);
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


function ctCreateTripInjectData(data) {
    GM_addStyle(
        `.cachetur-menu-button { cursor: pointer; }
         .cachetur-marker-added { opacity: 0.75; border: 1px solid green; border-radius: 4px; }`
    );
    GM_addStyle(
        `.cachetur-map_marker { width: 18px; height: 18px; font-size: 10px; text-align: center; }
         .cachetur-map_marker_symbol { border: 1px solid gray; -moz-border-radius: 3px; border-radius: 3px;
                background: #F8F8FF no-repeat center; width: 18px; height: 18px;
                padding-top: 1px; padding-bottom: 1px; padding-right: 1px; }
         .cachetur-map_marker_disabled { border: 1px solid #ffffff; background-color: #ff0000; }
         .cachetur-map_marker_corrected { border: 1px solid #ffffff; background-color: greenyellow; }
         .cachetur-map_marker_dnf { border: 1px solid #ffffff; background-color: dodgerblue; } `
    );

    ctPrependToHeader(
        `<li id="cachetur-header">
            <img src="https://cachetur.net/img/logo_top.png" title="${i18next.t("menu.loggedinas")} ${_ctCacheturUser}" />
            ${i18next.t("menu.addto")}
            <select id="cachetur-tur-valg">
                ${data}
            </select>
            <button id="cachetur-tur-open" class="cachetur-menu-button" type="button" title="${i18next.t("menu.opentrip")}">
                <img src="https://cachetur.no/api/img/arrow.png" style="height:16px;"/>
            </button>
            <button id="cachetur-tur-refresh" type="button" class="cachetur-menu-button" title="${i18next.t("menu.refresh")}">
                <img src="https://cachetur.no/api/img/refresh.png" style="height:16px;"/>
            </button>
            <button id="cachetur-tur-add-ct-caches" type="button" class="cachetur-menu-button" title="${i18next.t("menu.showonmap")}">
                <img src="https://cachetur.no/api/img/map.png" style="height:16px;"/>
            </button>
            <button id="cachetur-tur-fitbounds" class="cachetur-menu-button" type="button" title="${i18next.t("menu.fitroute")}">
                <img src="https://cachetur.no/api/img/zoom.png" style="height:16px;"/>
            </button>
            <span id="cachetur-tur-antall-container">
                (<span id="cachetur-tur-antall"></span>)
            </span>
        </li>`
    );
}


function tripChanged() {
    const id = document.getElementById("cachetur-tur-valg").value;
    ctGetAddedCodes(id);
    ctGetShowTripData(id);
    GM_setValue("cachetur_selected_trip", id);
    GM_setValue("cachetur_last_action", Date.now());
}

function openTrip() {
    const selected = document.getElementById("cachetur-tur-valg").value;
    let url = "https://cachetur.no/";
    if (selected.endsWith("L"))
        url = url + "liste/" + selected.substring(0, selected.length - 1);
    else if (selected.endsWith("T"))
        url = url + "template/" + selected.substring(0, selected.length - 1);
    else url = url + "fellestur/" + selected;

    GM_openInTab(url);
}

async function refreshTrip() {
    console.log("Refreshing list of trips and data for selected trip");
    const optionElement = document.getElementById("cachetur-tur-valg");
    const id = optionElement.value;
    document.getElementById("cachetur-tur-antall").text = "Loading"; // TODO: Translatable text

    const available = await ctApiCall("planlagt_list_editable", {
        includetemplates: "true",
    });

    let options = "";

    for (let item of available) {
        options += `<option value="${item.id}">${item.turnavn}</option>`;
    }

    optionElement.text = "";
    optionElement.replaceChildren(HTMLStringToElement(options));
    optionElement.value = id;
    
    ctGetAddedCodes(id);
    ctGetShowTripData(id);
    GM_setValue("cachetur_last_action", Date.now());
    console.log("Finished refreshing list of trips and data for selected trip");
}

function addCache() {
    console.log("Adding caches from cachetur.no");
    const id = document.getElementById("cachetur-tur-valg").value;
    ctAddCacheMarkersToMap(id);
}

function fitBounds() {
    const unsafeLeafletObject = _ctPageHandler.getUnsafeLeafletObject();
    if (unsafeLeafletObject && unsafeWindow.cacheturRouteLayer)
        unsafeLeafletObject.fitBounds(
            unsafeWindow.cacheturRouteLayer.getBounds()
        );
    if (_ctPageHandler instanceof GC_SearchMapPageHandler) {
        document.getElementById("clear-map-control").click();
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

    for (let item of available) {
        options += `<option value="${item.id}">${item.turnavn}</option>`;
    }

    _ctPageHandler.ctCreateTripList();
    ctCreateTripInjectData(options);

    const tripSelector = document.getElementById("cachetur-tur-valg");
    let storedTrip = GM_getValue("cachetur_selected_trip", 0);

    let isStoredTripInSelection = false;
    const selectorOptions = tripSelector.children;
    for (const option of selectorOptions) {
        if (option instanceof HTMLOptionElement) {
            const value = option.value
            if (value === storedTrip) {
                isStoredTripInSelection = true;
            tripSelector.value = value;
            break;
            }
        }
    }
    

    if (!isStoredTripInSelection) {
        if (selectorOptions.length > 0) {
            storedTrip = selectorOptions.children[0].value;
        } else {
            storedTrip = 0;
        }

        GM_setValue("cachetur_selected_trip", storedTrip);
    }

    ctGetAddedCodes(storedTrip);
    ctGetShowTripData(storedTrip);

    tripSelector.addEventListener("change", tripChanged);
    document.getElementById("cachetur-tur-open").addEventListener("click", openTrip);
    document.getElementById("cachetur-tur-refresh").addEventListener("click", refreshTrip);
    document.getElementById("cachetur-tur-add-ct-caches").addEventListener("click", addCache);
    document.getElementById("cachetur-tur-fitbounds").addEventListener("click", fitBounds);

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

    document.getElementById("cachetur-tur-antall").innerHTML = _ctCodesAdded.length;
}

async function ctGetShowTripData(id) {
    if (!id || id.endsWith("L")) {
        document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = true;
        return;
    }

    const unsafeLeafletObject = _ctPageHandler.getUnsafeLeafletObject();
    if (!unsafeLeafletObject) {
        document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = true;
        document.getElementById("cachetur-tur-add-ct-caches").attributes["disabled"] = true;
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
        document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = true;
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
    for (let item of waypointData) {
        const icon = L.divIcon({
            className: "cachetur-map_marker",
            iconSize: [18, 18],
            riseOnHover: true,
            html:`<div class="cachetur-map_marker_symbol" title="${item.name}">
                        <img src="${item.typeicon}"/>
                  </div>
                  <span class="label label-default"></span>`
            });
        
        const newWP = L.marker([item.lat, item.lon], {icon: icon});
        markers.push(newWP);
    }

    _waypointLayer = L.layerGroup(markers);
    unsafeWindow.cacheturWaypointsLayer = cloneInto(
        _waypointLayer,
        unsafeWindow
    );

    console.log("Injecting waypoints");
    unsafeLeafletObject.addLayer(unsafeWindow.cacheturWaypointsLayer);

    document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = false;
    document.getElementById("cachetur-tur-add-ct-caches").attributes["disabled"] = false;
}

async function ctAddCacheMarkersToMap(id) {
    console.log("Attempting to fetch cache coordinates for selected trip");

    const unsafeLeafletObject = _ctPageHandler.getUnsafeLeafletObject();
    if (!unsafeLeafletObject) {
        document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = true;
        document.getElementById("cachetur-tur-add-ct-caches").attributes["disabled"] = true;
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
        document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = true;
        return;
    }

    console.log("Cache data received, constructing markers");

    let markers = [];
    for (let item of waypointData) {
        const icon = L.divIcon({
            className: "cachetur-map_marker",
            iconSize: [18, 18],
            riseOnHover: true,
            html:`<div class="cachetur-map_marker_symbol" title="${item.name}">
                        <img src="${item.typeicon}"/>
                  </div>
                  <span class="label label-default"></span>`
            });
        
        const newWP = L.marker([item.lat, item.lon], {icon: icon});
        markers.push(newWP);
    }

    _cacheLayer = L.layerGroup(markers);
    unsafeWindow.cacheturCacheLayer = cloneInto(_cacheLayer, unsafeWindow);

    console.log("Injecting caches");
    unsafeLeafletObject.addLayer(unsafeWindow.cacheturCacheLayer);

    document.getElementById("cachetur-tur-fitbounds").attributes["disabled"] = false;
    document.getElementById("cachetur-tur-add-ct-caches").attributes["disabled"] = false;
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
        `<div class="CacheDetailNavigationWidget">
            <h3 class="WidgetHeader">
                <img src="https://cachetur.no/api/img/cachetur-15.png" />
                Cachetur.no
            </h3>
            <div class="WidgetBody">
                <ul class="BookmarkList">`;

    for (let item of listData) {
        let source;
        switch(item.source) {
            case "triptemplate":
                source = "tur";
                break;
            case "trip":
                source = "fellestur";
                break;
            default:
                source = "liste";
                break;
        }
        let listElement = 
                `<li ${(alternate ? "class=\"AlternatingRow" : "")}">
                    <a href="https://cachetur.no/${source}/${item.id}>${item.name}</a>
                    <br>${i18next.t("template.by")} ${item.owner}
                </li>`
        alternate = !alternate;
        listHtml += listElement;
    }
    
    listHtml += "</ul></div></div>";

    const elements = document.getElementsByClassName("sidebar");
    for (const elem of elements) {
        elem.appendChild(HTMLStringToElement(listHtml));
    }
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
        `<div class="cachetur-controls-container">
            <h3 class="WidgetHeader">
                <img src="https://cachetur.no/api/img/cachetur-15.png" />
                Cachetur.no
            </h3>
            <div class="WidgetBody">
                <h5>
                    ${i18next.t("lists.in")}
                </h5>
            <ul>`;

    for (let item of listData) {
        let source;
        switch(item.source) {
            case "triptemplate":
                source = "tur";
                break;
            case "trip":
                source = "fellestur";
                break;
            default:
                source = "liste";
                break;
        }
        let listElement = 
                `<li ${(alternate ? "class=\"AlternatingRow" : "")}">
                    <a href="https://cachetur.no/${source}/${item.id}>${item.name}</a>
                    <br>${i18next.t("template.by")} ${item.owner}
                </li>`
        alternate = !alternate;
        listHtml += listElement;
    }

    listHtml += "</ul></div></div>";

    const elements = document.getElementsByClassName("cache-preview-action-menu");
    for (const elem of elements) {
        elem.prepend(HTMLStringToElement(listHtml));
    }
}

function onGSAKcontentChanged(mutationsList, observer) {
    if (document.getElementsByClassName("a").length === 0) {
        return;
    }
    const cacheCode = document.getElementsByClassName("a")[0].text;

    if (cacheCode === _ctNewMapActiveCache) {
        return;
    }
    _ctNewMapActiveCache = cacheCode;
    const elements = document.getElementsByClassName("cachetur-add-code");
    for (const elem of elements) {
        elem.dataset.code = cacheCode;
    }
    const metadataElems = document.getElementsByClassName("cache-metadata-code");
    for (const elem of metadataElems) {
        ctAddToCoordInfoLink(elem);
    }
    ctUpdateAddImage();
}

function ctWatchgsakMap() {
    console.log("start mutationobserver");
    const targetNode = document.body;
    const config = {
        attributes: true,
        childList: true,
        subtree: true,
    };

    let observer = new MutationObserver(onGSAKcontentChanged);
    observer.observe(targetNode, config);
    document.body.addEventListener("click", onCacheturAddClicked);
}

function onNewMapContentChanged(mutationsList, observer) {
    if (document.getElementsByClassName("primary log-geocache").length === 0) {
        return;
    }
    const cacheCode = document.getElementsByClassName("cache-metadata-code")[0].innerText;

    if (cacheCode === _ctNewMapActiveCache) {
        return;
    }
    _ctNewMapActiveCache = cacheCode;

    const elements = document.getElementsByClassName("cachetur-add-code");
    for (const elem of elements) {
        elem.dataset.code = cacheCode;
    }
    const metadataElems = document.getElementsByClassName("cache-metadata-code");
    for (const elem of metadataElems) {
        ctAddToCoordInfoLink(elem);
    }
    ctUpdateAddImage();
}

function ctWatchNewMap() {
    console.log("start mutationobserver");
    let targetNode = document.body;
    let config = {
        attributes: true,
        childList: true,
        subtree: true,
    };

    let observer = new MutationObserver(onNewMapContentChanged);
    observer.observe(targetNode, config);
    document.body.addEventListener("click", onCacheturAddClicked);
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
    const codeElems = document.getElementsByClassName("code");

    if (codeElems.length === _ctLastCount) {
        return;
    }
    _ctLastCount = codeElems.length;
    for (const codeElem of codeElems) {
        ctAddToCoordInfoLink(codeElem)
    }
}

function tryAddClassCacheturAdd(elem) {
    if (elem.classList.contains("cachetur-add")) {
        return;
    }
    const gcCode = elem.innerHTML;

    _ctPageHandler.addCacheturToCacheMenu(elem, gcCode);
    ctUpdateAddImage();
}

async function onCacheturAddClicked(evt) {
    if (!evt.target.matches(".cachetur-add-code")) {
        return;
    }
    evt.stopImmediatePropagation();
    evt.preventDefault();

    const tur = document.getElementById("cachetur-tur-valg").value;
    const img = document.getElementsByClassName("cachetur-add-code");
    
    const code = img[0]?.dataset.code;

    const data = await ctApiCall("planlagt_add_codes", {
        tur: tur,
        code: code,
    });
    if (data === "Ok") {
        _ctCodesAdded.push(code);
        ctUpdateAddImage(true);
        document.getElementById("cachetur-tur-antall").html = _ctCodesAdded.length;
    } else {
        _ctPageHandler.addCacheToListError(img);
    }

    GM_setValue("cachetur_last_action", Date.now());
}

function ctAddToCoordInfoLink(elem) {
    tryAddClassCacheturAdd(elem);
    const elements = document.getElementsByClassName("cachetur-add-code");
    for (const elem of elements) {
        elem.addEventListener("click", onCacheturAddClicked);
    }
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
        ctGetShowTripData(tur);
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

    const map = _ctPageHandler.getUnsafeLeafletObject();
    if (!map) {
        return;
    }

    map.eachLayer(function (layer) {
        ctCheckAndMarkLayer(layer);
    });
}

function ctCheckAndMarkLayer(layer) {
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
    if (!(_ctPageHandler instanceof PGC_VirtualGPSPageHandler)) {
        return;
    }

    const addedElements = document.getElementsByClassName("cachetur-pgc-added");
    for (const addedElem of addedElements) {
        addedElem.remove();
    }

    const stringToAdd = `
        <img class="cachetur-pgc-added"
            src="https://cachetur.no/api/img/cachetur-15-success.png"
            title="${i18next.t("sent")}">`;
    const elemToAdd = HTMLStringToElement(stringToAdd);

    const tableElem = document.getElementById("vgpsTable");
    const filtered = tableElem.getElementsByClassName("jqgrow.ui-row-ltr ui-widget-content");
    for (const item of filtered) {
        const codeElements = item.querySelectorAll("[aria-describedby*='vgpsTable_gccode']");
        for (const elem of codeElements) {
            const code = elem.querySelector("a")?.innerHTML;
            if (ctCodeAlreadyAdded(code)) {
                const elems = item.querySelectorAll("[aria-describedby*='vgpsTable_name']");
                for (const elem of elems) {
                    elem.prepend(elemToAdd);
                }
            }
        }
    }
}


function onSendBMList(evt) {
    evt.stopImmediatePropagation();
    evt.preventDefault();

    ctListSendSelected();
}

async function ctAddSendListButton() {
    await waitForElement(".multi-select-action-bar");
    console.log("Injecting send to cachetur button");

    const stringToAdd = `
        <button type="button"
            class="cachetur-send-bmlist gc-button multi-select-action-bar-button
                    gc-button-has-type gc-button-primary"
            style="margin-left: 5px;">
                <img src="https://cachetur.no/api/img/cachetur-15.png"
                    title="${i18next.t("send")}" style="cursor: pointer;" />
                ${i18next.t("vgps.sendmarked")}
        </button>`;
    const elemToAdd = HTMLStringToElement(stringToAdd);

    const elems = document.getElementsByClassName("multi-select-action-bar-count-section");
    for (const elem of elems) {
        elem.after(elemToAdd);
    }

    const sendElems = document.getElementsByClassName("cachetur-send-bmlist");
    for (const elem of sendElems) {
        elem.addEventListener("click", onSendBMList);
    }
}

async function ctListSendSelected() {
    const selectedBoxes = document.querySelectorAll('.geocache-table tbody tr input[type="checkbox"]:checked');
    let selectedElems = [];
    for (const selected of selectedBoxes) {
        selectedElems.push(selected.closest("tr").querySelectorAll(".geocache-code"));
    }
    
    if (selected.length <= 0) {
        return;
    }

    const tur = document.getElementById("cachetur-tur-valg").value;
    let codes = [];

    for (const item of selectedElems) {
        codes.push(item.text.split("|")[1].trim());
    }

    const data = await ctApiCall("planlagt_add_codes", {
        tur: tur,
        code: codes,
    });
    if (data === "Ok") {
        ctGetAddedCodes(tur);
        ctGetShowTripData(tur);
        alert(i18next.t("vgps.sent"));
    } else {
        alert(i18next.t("vgps.error"));
    }

    GM_setValue("cachetur_last_action", Date.now());
}

async function ctCheckList() {
    if (!(_ctPageHandler instanceof GC_BookmarkListPageHandler)) {
        return;
    }

    await waitForElement(".geocache-table");
    const addedElems = document.getElementsByClassName("cachetur-bmlist-add");
    for (const elem of addedElems) {
        elem.remove();
    }

    const cacheTableLines = document.querySelector("table.geocache-table")?.querySelectorAll("tr");
    for (const line in cacheTableLines) {
        const codeElem = line.querySelector(".geocache-code");
        const codeInfo = codeElem.textContent.split("|");
        if (codeInfo.length <=1) {
            continue;
        }

        const code = codeInfo[1].trim();
        if (ctCodeAlreadyAdded(code)) {
            const elemToAdd = HTMLStringToElement(`
                <img class="cachetur-bmlist-added"
                    src="https://cachetur.no/api/img/cachetur-15-success.png"
                    title="${i18next.t("sent")}">`);
            codeElem.prepend(elemToAdd);
        }
    }
}

async function onCommentClicked(evt) {
    evt.stopImmediatePropagation();
    evt.preventDefault();

    const tur = document.getElementById("cachetur-tur-valg").value;
    const commentImg = evt.target;
    const commentCode = commentImg.dataset.code;
    const comment = prompt(i18next.t("comments.description"));

    const data = await ctApiCall("planlagt_add_code_comment", {
        tur: tur,
        code: commentCode,
        comment: comment,
    });

    if (data === "Ok") {
        _ctPageHandler.addCommentSuccess(commentImg);
    } else {
        _ctPageHandler.addCommentError(commentImg);
    }

    GM_setValue("cachetur_last_action", Date.now());
}

function ctUpdateAddImage(codeAddedTo) {
    ctPGCMarkFound();

    let imgs = document.getElementsByClassName("cachetur-add-code");
    if (imgs.length <= 0) return;

    for (const img of imgs) {
        const code = img.data("code");
        const codeIsAdded = codeAddedTo === code || ctCodeAlreadyAdded(code);
    
        ctSetIconForCode(code);
    
        if (codeIsAdded) {
            _ctPageHandler.updateCacheIsAdded(img);
            if (img.parentElement.parentElement.querySelectorAll(".cachetur-add-comment").length > 0) {
                return;
            }
            
            let style = "padding-right: 5px;";
            if (_ctPageHandler instanceof PGC_MapPageHandler) {
                style = "left: 60px;";
            }
    
            const commentControl = _ctPageHandler.addCommentControl(img, code, style);
            commentControl.addEventListener("click", onCommentClicked);
            
            if (!document.getElementById("cachetur-tur-valg").value.endsWith("T")) {
                ctCreatePriorityControl(img, code, 1);
                ctCreatePriorityControl(img, code, 2);
                ctCreatePriorityControl(img, code, 3);
            }
        } else {
            _ctPageHandler.addNotInListControl(img);
        }
    }
}

async function onPriorityClicked(evt) {
    evt.stopImmediatePropagation();
    evt.preventDefault();

    const tur = document.getElementById("cachetur-tur-valg").value;
    const priorityImg = evt.target;
    const priorityCode = priorityImg.dataset.code;
    const priority = priorityImg.querySelector('[data-priority]').dataset.priority;

    const data = await ctApiCall("planlagt_set_code_priority", {
        tur: tur,
        code: priorityCode,
        priority: priority,
    });
    if (data === "Ok") {
        _ctPageHandler.setPrioritySuccess(priorityImg, priority);
    }
    GM_setValue("cachetur_last_action", Date.now());
}

function ctCreatePriorityControl(img, code, priority) {
    let style = "padding-right: 5px;";
    if (_ctPage === "pgc_map") {
        let left = 60 + priority * 20;
        style = "left: " + left + "px";
    }
    const control = _ctPageHandler.addPriorityControl(img, code, priority, style);
    control.addEventListener("click", onPriorityClicked);
}

function ctCodeAlreadyAdded(code) {
    return _ctCodesAdded.indexOf(code) > -1;
}

async function ctSetIconForCode(code) {
    const id = document.getElementById("cachetur-tur-valg").value;
    const foundBy = await ctApiCall("planlagt_check_find", {
        tur: id,
        code: code,
    });
    if (foundBy === "") {
        return;
    }
    const imgElems = document.querySelectorAll(`.cachetur-add-code[data-code='${code}']`);
    if (imgElems.length <= 0) {
        return;
    }
    if (document.querySelectorAll(`.cachetur-found-by[data-code='${code}']`).length > 0) {
        return;
    }
        
    let style = "";
    if (_ctPageHandler instanceof PGC_MapPageHandler) {
        style = "left: 40px;";
    }

    _ctPageHandler.setIconForCode(imgElems, foundBy, code, style);
}

// Get url parameter.
function getURLParam(key) {
    const query = window.location.search.substring(1);
    const pairs = query.split("&");
    for (const pair of pairs) {
        const pairData = pair.split("=");
        if (pairData[0] == key) {
            if (pairData[1].length > 0) {
                return pair[1];
            }
        }
    }
    return undefined;
}


function countdown(waitTime) {
    if (waitTime < 1) {
        document.getElementById("cta-waiting-msg").remove();
        const loadingContainer = document.querySelector("div.loading-container");
        loadingContainer.style.display = "none";
        loadingContainer.classList.remove("show");
        document.querySelector("body").classList.remove("cta-waiting-msg");
    } else {
        const loadingContainer = document.querySelector("div.loading-container");
        loadingContainer.style.display = "flex";
        loadingContainer.classList.add("show");
        document.getElementById("cta-waiting-msg").remove();

        const elemToAdd = HTMLStringToElement(`
            <span id="cta-waiting-msg" role="alert" aria-live="assertive">
                ${i18next.t("refresh.tomany ")} ${waitTime} ${i18next.t(" refresh.s")}
            </span>`);
        document.querySelector(".loading-display").appendChild(elemToAdd);
        
        setTimeout(function () {
            countdown(--waitTime);
        }, 1000);
    }
}


function autoMapRefresh() {
    if (document.querySelectorAll(".loading-container.show").length > 0) {
        return;
    }

    const pxHeight = window.innerHeight;
    const pxWidth = window.innerWidth;
    const lat = parseFloat(getURLParam("lat"));
    const lng = parseFloat(getURLParam("lng"));
    const zoom = parseInt(getURLParam("zoom"));
    
    const metersPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
    
    const latMeterDistance = metersPerPx * pxHeight;
    const lngMeterDistance = metersPerPx * pxWidth;
    const latHalfDezDistance = latMeterDistance / 1850 / 60 / 2;
    const lngHalfDezDistance = lngMeterDistance / (1850 * Math.cos((lat * Math.PI) / 180)) / 60 / 2;
    
    const latHigh = (lat + latHalfDezDistance).toFixed(4);
    const latLow = (lat - latHalfDezDistance).toFixed(4);
    const lngHigh = (lng + lngHalfDezDistance).toFixed(4);
    const lngLow = (lng - lngHalfDezDistance).toFixed(4);
    if (_mapInfo.firstRun || latHigh > _mapInfo.latHighPrev ||
        latLow < _mapInfo.latLowPrev || lngHigh > _mapInfo.lngHighPrev ||
        lngLow < _mapInfo.lngLowPrev
    ) {
        _mapInfo.latHighPrev = latHigh;
        _mapInfo.latLowPrev = latLow;
        _mapInfo.lngHighPrev = lngHigh;
        _mapInfo.lngLowPrev = lngLow;
        if (!_mapInfo.firstRun) {
            let times = JSON.parse(GM_getValue("search_this_area_times", "[]"));
            if (times.length < 9) {
                document.getElementById("clear-map-control").click();
                times.push(Date.now());
                GM_setValue("search_this_area_times", JSON.stringify(times));
            } else {
                const t = Date.now();
                // check 1min limit
                const timeFromOldestSearch = t - times[0];
                if (timeFromOldestSearch > ONE_MINUTE_MS) {
                    document.getElementById("clear-map-control").click();
                    times.splice(0, 1);
                    times.push(t);
                    GM_setValue("search_this_area_times", JSON.stringify(times));
                } else if (document.querySelectorAll("body.cta-waiting-msg").length === 0) {
                    document.querySelector("body").classList.add("cta-waiting-msg");
                    const wait = Math.ceil( (ONE_MINUTE_MS - timeFromOldestSearch) / 1000 );
                    countdown(wait);
                }
            }
        }
        _mapInfo.firstRun = false;
    }
}

function searchThisArea(waitCount) {
    if (document.querySelector(".leaflet-gl-layer.mapboxgl-map") || document.querySelector("div.gm-style")) {
        // Leaflet or GM
        if (_mapInfo.firstRun &&
                !document.querySelector(".loading-container.show") &&
                !document.querySelector("li.active svg.my-lists-toggle-icon") &&
                document.getElementById("#clear-map-control")) {
            setTimeout(autoMapRefresh, 400);
        }
    } else {
        waitCount++;
        if (waitCount <= 200) {
            setTimeout(function () {
                searchThisArea(waitCount);
            }, 50);
        }
    }
}

function ctFixNewGcMapIssues() {
    if (window.location.href.indexOf("bm=") > -1) {
        return;
    }
    
    window.history.pushState = new Proxy(window.history.pushState, {
        apply: (target, thisArg, argArray) => {
            searchThisArea(0);
            return target.apply(thisArg, argArray);
        },
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

async function getStatData() {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url: "http://www.geocaching.com/my/statistics.aspx",
            onload: function (data) {
                try {
                    resolve(JSON.parse(data.responseText));
                } catch (e) {
                    console.warn("Couldn't load GC statistics");
                    reject(e);
                }
            },
        });
        
    })
}

// TODO: Remove or make it usable for high find users (matrix analysis), extend page support?
async function tvinfo() {
    if (!(_ctPageHandler instanceof GC_CachePageHandler ||
          _ctPageHandler instanceof GC_BrowseMapPageHandler ||
          _ctPageHandler instanceof GC_SearchMapPageHandler)) {
            return;
          }
    if (_ctPageHandler instanceof GC_SearchMapPageHandler) {
        await waitForElement(".cache-preview-attributes");
    } else if (_ctPageHandler instanceof GC_BrowseMapPageHandler) {
        await waitForElement(".code");
    }

    const data = await getStatData();

    const resultDifficultyTerrainCaches = data.getElementById("#DifficultyTerrainCaches");
    const cacheDT = _ctPageHandler.getCurrentCacheDT();
    
    let nbDT = "0";
    if (resultDifficultyTerrainCaches !== "") {
        nbDT = resultDifficultyTerrainCaches.querySelector(`#${((cacheDT.D - 1) * 2 + 1)}_${((cacheDT.T - 1) * 2 + 1)}`).innerHTML;
    }
    _ctPageHandler.addDTstat(nbDT);
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
