import { Router } from 'itty-router'
import * as client from './fetchProxy'
import * as msal from '@azure/msal-node'
import { v4 as uuid } from "uuid"
import "yet-another-abortcontroller-polyfill"
const Pusher = require("pusher")

const CookiesName = "_todo";
const HOST = "https://todo.mscdn.cf";
// const HOST = "http://localhost:3000";
const REDIRECT_URI = HOST + "/redirect";
const pca = new msal.ConfidentialClientApplication({
  auth: {
    clientId: "e1e413f1-1e36-4d8b-9470-cdc93f17196a",
    authority: "https://login.microsoftonline.com/common",
    clientSecret: "-rliKAs_W9Il6-9OaKa-4VS7oI_WM-GiY4",
  },
  system: {
    networkClient: client
  }
});
const pusher = new Pusher({
  appId: "1163927",
  key: "88a622c1a678a56ee642",
  secret: "5516211c4fa83ce6eb3f",
  cluster: "ap1",
  useTLS: true
});

function getCookie(request, name) {
  let result = ""
  const cookieString = request.headers.get("Cookie")
  if (cookieString) {
    const cookies = cookieString.split(";")
    cookies.forEach(cookie => {
      const cookiePair = cookie.split("=", 2)
      const cookieName = cookiePair[0].trim()
      if (cookieName === name) {
        const cookieVal = cookiePair[1]
        result = cookieVal
      }
    })
  }
  return result
}
// Create a new router
const router = Router()

function getHeader(accessToken) {
  var headers = new Headers()
  headers.set("Authorization", "Bearer " + accessToken);
  headers.set("Content-Type", "application/json");
  return headers
}

router.get("/", async (req) => {
  //获取cookies,看是否登陆
  let accessToken = getCookie(req, CookiesName)
  if (accessToken) {
    // 订阅更新,获取默认tasks的id,供订阅使用
    var taskInfo = await (await fetch("https://graph.microsoft.com/v1.0/me/todo/lists/tasks", {
      method: "GET",
      headers: getHeader(accessToken)
    })).json()
    var sub = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: getHeader(accessToken),
      body: JSON.stringify({
        "resource": `/me/todo/lists/${taskInfo.id}/tasks`,
        "expirationDateTime": new Date((new Date()).valueOf() + 1000 * 60 * 60 * 24).toISOString(),
        "notificationUrl": HOST + "/sub",
        // "notificationUrl": "https://todo.cn.utools.club/sub",
        "changeType": "created,updated,deleted",
        "clientState": "todo_list"
      })
    })

    var subResult = await sub.json()
    console.log("sub response:", sub.status, JSON.stringify(subResult))
    var res = await fetch("https://cdn.jsdelivr.net/gh/qinyongliang/kindle_todo/index.html");
    // var res = await fetch("https://list.cn.utools.club/index.html");
    return new Response(await (await res.text()).replaceAll("MY_TODO_SUB_ID", subResult.id), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    })
  } else {
    const authCodeUrlParameters = {
      scopes: ["openid", "profile", "User.Read", "Tasks.ReadWrite"],
      redirectUri: REDIRECT_URI,
    };
    let codeUrl = await pca.getAuthCodeUrl(authCodeUrlParameters)
    return Response.redirect(codeUrl, 302)
  }
})

router.get("/redirect", async (req) => {
  try {
    let res = await pca.acquireTokenByCode({
      code: req.query.code,
      scopes: ["openid", "profile", "User.Read", "Tasks.ReadWrite"],
      redirectUri: REDIRECT_URI,
    })
    return new Response(null, {
      status: 302,
      headers: {
        'Location': HOST + "/",
        //先暂时存在浏览器中
        'Set-Cookie': `${CookiesName}=${res.accessToken}; expires=${res.expiresOn.toUTCString()}; path=/; HttpOnly`
      }
    });
  } catch (error) {
    return new Response(error)
  }
})

router.all("/sub", async (req) => {
  console.log("收到订阅请求:", req.url)
  var validationToken = new URL(req.url).searchParams.get("validationToken")
  if (validationToken) {
    console.log("验证订阅请求:" + validationToken)
    return new Response(validationToken)
  } else {
    var sub = await req.json()
    console.log("订阅更新:", JSON.stringify(sub))
    for (const item of sub.value) {
      pusher.trigger(item.subscriptionId, "event", {
        message: "update"
      });
    }
    return new Response("", { status: 202 })
  }
})

router.all("/me/*", async (req) => {
  let accessToken = getCookie(req, CookiesName);
  if (accessToken) {
    var headers = new Headers()
    headers.set("Authorization", "Bearer " + accessToken);
    var body = await req.json()
    var url = `https://graph.microsoft.com/v1.0/me/todo/lists/tasks/tasks${req.url.split("/me")[1]}`
    console.log(`proxy fetch[${body.method}] : ${url}  ===> ${JSON.stringify(body)}`)
    var newReq = {
      method: body.method,
      headers: headers
    }
    if (body.body) {
      headers.set("content-type", "application/json")
      newReq.body = JSON.stringify(body.body)
    }
    return fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/tasks/tasks${req.url.split("/me")[1]}`, newReq)
  } else {
    return Response.redirect(HOST + "/", 302)
  }
})

/*
This is the last route we define, it will match anything that hasn't hit a route we've defined
above, therefore it's useful as a 404 (and avoids us hitting worker exceptions, so make sure to include it!).

Visit any page that doesn't exist (e.g. /foobar) to see it in action.
*/
router.all("*", () => new Response("404, not found!", { status: 404 }))

/*
This snippet ties our worker to the router we deifned above, all incoming requests
are passed to the router where your routes are called and the response is sent.
*/
addEventListener('fetch', (e) => {
  e.respondWith(router.handle(e.request))
})
