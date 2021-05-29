import { Router } from 'itty-router'
import * as client from './fetchProxy'
import * as msal from '@azure/msal-node'
import { v4 as uuid } from "uuid"

const CookiesName = "_todo";
const HOST = "https://todo.cn.utools.club";
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

router.get("/", async (req) => {
  //获取cookies,看是否登陆
  if (getCookie(req, CookiesName)) {
    // return fetch("https://todo.mscdn.cf")
    return fetch("https://list.cn.utools.club/")
  } else {
    const authCodeUrlParameters = {
      scopes: ["openid", "profile", "User.Read", "Mail.Read", "Tasks.ReadWrite"],
      // redirectUri: new URL(req.url).origin + "/redirect",
      redirectUri: REDIRECT_URI,
    };
    let codeUrl = await pca.getAuthCodeUrl(authCodeUrlParameters)
    return Response.redirect(codeUrl, 302)
  }
})

router.get("/redirect", async (req) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: ["openid", "profile", "User.Read", "Mail.Read", "Tasks.ReadWrite"],
    // redirectUri: new URL(req.url).origin + "/redirect",
    redirectUri: REDIRECT_URI,
  };
  let res = await pca.acquireTokenByCode(tokenRequest)
  let id = uuid()
  return new Response(null, {
    status: 302,
    headers: {
      'Location': HOST + "/",
      //先暂时存在浏览器中
      'Set-Cookie': `${CookiesName}=${res.accessToken}; expires=${res.expiresOn.toUTCString()}; path=/; HttpOnly`
    }
  });
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
