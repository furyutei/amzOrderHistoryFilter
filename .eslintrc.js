module.exports = {
    "plugins": [
        "jquery"
    ],
    "env": {
        "browser": true,
        "es6": true,
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
        "ecmaVersion": 2018
    },
    "rules": {
        "no-unused-vars": "off",
        "no-useless-escape" : "off",
        "no-empty": "off",
        "no-constant-condition": "off",
        "no-prototype-builtins": "warn",
    }
};
