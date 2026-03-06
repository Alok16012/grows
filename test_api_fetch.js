const http = require('http');

http.get('http://localhost:3000/api/groups', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log("Failed to parse JSON:", data);
        }
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
