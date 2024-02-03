module.exports = {
    "plugins": [
        "jquery"
    ],
    "env": {
        "browser": true,
        "es2021": true,
        "jquery": true,
        "node": true,
    },
    "extends": "eslint:recommended",
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly",
        "browser": "readonly",
        "chrome": "readonly",
        "GM_setValue": "readonly",
        "GM_getValue": "readonly",
        "content": "readonly",
    },
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "rules": {
        "no-unused-vars": "off",
        "no-useless-escape" : "off",
        "no-empty": "off",
        "no-constant-condition": "off",
        "no-prototype-builtins": "warn",
    }
};
