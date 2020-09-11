/* eslint-disable */

class EventHandler {
  init = false;
  newFieldRequested = false;
  eventQueue = [];
  initializeMessageListener() {
    window.addEventListener(
      "message",
      event => {
        this.handler(event);
      },
      false
    );
  }
  sendMessage(data) {
    IFrameInitializer.contenuIframe.contentWindow.postMessage(data, "*");
  }
  handler(event) {
    if (event.data) {
      switch (event.data.type) {
        case "init":
          this.init = true;
          this.sendMessage({
            type: "init",
            envMode: process.env.NODE_ENV
          });
          IFrameInitializer.contenuIframe.style.width = "100%";
          break;
        case "newFields":
          this.newFieldRequested = true;
          this.requestNewFields(Parser.compare(Contenu.data, Contenu.res));
          Contenu.res = JSON.parse(JSON.stringify(Contenu.data));
          break;
        case "cssRules":
          if (event.data.value) {
            // make iframe big
            for (let key in event.data.value) {
              IFrameInitializer.contenuIframe.style[key] =
                event.data.value[key];
            }
          }

          break;
        case "dataUpdate":
          let obj = Contenu.data;
          var stack = event.data.path.split(".");
          while (stack.length > 1) {
            obj = obj[stack.shift()];
          }
          obj[stack.shift()] = event.data.data;
          break;
      }
    }
  }
  requestNewFields(objPath = null) {
    if (objPath != null)
      this.eventQueue.push({
        type: "newField",
        data: objPath
      });
    if (this.init) {
      this.eventQueue = this.eventQueue.reverse();
      for (let i in this.eventQueue) {
        this.sendMessage(this.eventQueue[i]);
      }
      this.eventQueue = [];
    }
  }
}
class Parser {
  static parse(obj1, result) {
    for (let key in obj1) {
      if (typeof obj1[key] === "object") {
        if (typeof result[key] == "undefined") result[key] = {};
        result[key] = Parser.parse(obj1[key], result[key]);
      } else {
        set(result, key, obj1[key]);
      }
    }
    return result;
  }

  static compare(obj1, obj2) {
    let unknownPaths = {};
    for (let key in obj1) {
      if (typeof obj2[key] === "undefined") {
        unknownPaths[key] = JSON.parse(JSON.stringify(obj1[key]));
      } else if (
        typeof obj2[key] === "object" &&
        typeof obj1[key] === "object"
      ) {
        let unknownInnerPaths = Parser.compare(obj1[key], obj2[key]);
        if (Object.keys(unknownInnerPaths).length > 0)
          unknownPaths[key] = unknownInnerPaths;
      }
    }
    return unknownPaths;
  }
}

class IFrameInitializer {
  static contenuIframe = null;
  constructor(serverUrl, key) {
    IFrameInitializer.contenuIframe = document.createElement("iframe");
    IFrameInitializer.contenuIframe.setAttribute("id", "contenuWidget");
    IFrameInitializer.contenuIframe.setAttribute(
      "style",
      [
        "position:fixed",
        "border:0",
        "width:0",
        "height:0",
        "overflow: hidden"
      ].join(";")
    );
    IFrameInitializer.contenuIframe.setAttribute(
      "src",
      serverUrl + "?key=" + key
    );
  }
  mount(doc) {
    doc.appendChild(IFrameInitializer.contenuIframe);
  }
  remove() {
    IFrameInitializer.contenuIframe.parentNode.removeChild(
      IFrameInitializer.contenuIframe
    );
  }
}

class Contenu {
  static data = {};
  static props = {};
  static res = {};
  static serverUrl;
  loaded = false;
  iFrame = null;
  key = "/";
  static handler = null;
  fetchDataAddress = "";
  constructor(options) {
    Contenu.serverUrl = options.serverAddress;
    this.fetchDataAddress = options.fetchDataAddress || "/api/data";
    Contenu.handler = new EventHandler();
    Contenu.handler.initializeMessageListener();
    return this;
  }
  start() {
    Contenu.data = {};
    observable(Contenu.data);
    if (this.iFrame) this.iFrame.remove();
    this.fetchDataFromServer();
    this.initIFrame(this.key);
  }
  setKey(key) {
    this.key = key;
    Contenu.data = {};
    observable(Contenu.data);
    if (this.iFrame) this.iFrame.remove();
    this.fetchDataFromServer();
    this.initIFrame(this.key);
  }
  initIFrame(key) {
    this.iFrame = new IFrameInitializer(Contenu.serverUrl, key);
    this.iFrame.mount(document.getElementsByTagName("body")[0]);
  }
  fetchDataFromServer() {
    fetch(Contenu.serverUrl + this.fetchDataAddress + "?key=" + this.key)
      .then(response => response.json())
      .then(res => {
        Contenu.res = res.content;
        Parser.parse(res.content, Contenu.data);
        this.loaded = true;
      })
      .catch(error =>
        console.error("Contenu is unable to connect to server", error)
      );
  }
}
let finder = path => {
  let pathArr = path.split(".");
  if (pathArr.length > 0) {
    let i = 0;
    let obj = Contenu.data;
    while (i != pathArr.length) {
      if (typeof obj[pathArr[i]] === "undefined") {
        set(obj, pathArr[i], {});
      }
      obj = obj[pathArr[i]];
      i++;
    }
    //empty object
    if (typeof obj === "object" && Object.keys(obj).length == 0) obj = "";
    // image format
    if (obj.__type == "image") {
      return Contenu.serverUrl + "/api/files/" + obj.__value;
    }
    return obj;
  }
};
var set;
var observable;
export default {
  install(Vue, options) {
    set = Vue.set;
    observable = Vue.observable;
    window.$contenu = new Contenu(options);

    if (options.router) {
      options.router.beforeEach((to, from, next) => {
        window.$contenu.setKey(to.path);
        Vue.prototype.$contenu = finder;
        next();
      });
    } else {
      window.$contenu.start();
      Vue.prototype.$contenu = finder;
    }
  }
};
