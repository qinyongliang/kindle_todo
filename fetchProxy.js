async function sendGetRequestAsync(url, options) {
    const response = await fetch(url, options);
    const json = await response.json();
    return {
        headers: response.headers,
        body: json,
        status: response.status
    }
}

async function sendPostRequestAsync(url, options) {
    const sendingOptions = options || {};
    sendingOptions.method = 'post';
    const response = await fetch(url, sendingOptions);
    const json = await response.json()
    return {
        headers: response.headers,
        body: json,
        status: response.status
    }
}

module.exports = {
    sendGetRequestAsync,
    sendPostRequestAsync
}