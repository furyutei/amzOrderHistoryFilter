( function () {

'use strict';

if ( typeof browser == 'undefined' ) { window.browser = chrome; }


var DEBUG = false,
    SCRIPT_NAME = 'background',
    
    IS_EDGE = ( 0 <= window.navigator.userAgent.toLowerCase().indexOf( 'edge' ) ),
    
    TAB_LIST = [],
    TAB_MAP = {};


function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


if ( typeof console.log.apply == 'undefined' ) {
    // MS-Edge 拡張機能では console.log.apply 等が undefined
    // → apply できるようにパッチをあてる
    // ※参考：[javascript - console.log.apply not working in IE9 - Stack Overflow](https://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9)
    
    [ 'log', 'info', 'warn', 'error', 'assert', 'dir', 'clear', 'profile', 'profileEnd' ].forEach( function ( method ) {
        console[ method ] = this.bind( console[ method ], console );
    }, Function.prototype.call );
    
    console.log( 'note: console.log.apply is undefined => patched' );
}


function log_debug() {
    if ( ! DEBUG ) {
        return;
    }
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.log.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_debug()


function log_error() {
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.error.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_error()


function get_bool( value ) {
    if ( value === undefined ) {
        return null;
    }
    if ( ( value === '0' ) || ( value === 0 ) || ( value === false ) || ( value === 'false' ) ) {
        return false;
    }
    if ( ( value === '1' ) || ( value === 1 ) || ( value === true ) || ( value === 'true' ) ) {
        return true;
    }
    return null;
}  // end of get_bool()


function save_tab_info() {
    log_debug( 'save_tab_info()', TAB_LIST, TAB_MAP );
    localStorage.setItem( 'TAB_INFO', JSON.stringify( { tab_list : TAB_LIST, tab_map : TAB_MAP } ) );
} // end of load_tab_info()


function load_tab_info() {
    try {
        var tab_info = JSON.parse( localStorage.getItem( 'TAB_INFO' ) );
        
        TAB_LIST = tab_info.tab_list;
        TAB_MAP = tab_info.tab_map;
        
        if ( ! TAB_LIST ) {
            TAB_LIST = [];
        }
        if ( ! TAB_MAP ) {
            TAB_MAP = {};
        }
    }
    catch ( error ) {
        TAB_LIST = [];
        TAB_MAP = {};
    }
    log_debug( 'load_tab_info()', TAB_LIST, TAB_MAP );
} // end of load_tab_info()


function get_tab_info( tab_id ) {
    return new Promise( function ( resolve, reject ) {
        browser.tabs.get( tab_id, function ( tab ) {
            load_tab_info();
            
            if ( ( ! tab ) || ( ! tab.id ) ) {
                delete TAB_MAP[ tab_id ];
                save_tab_info();
            }
            // tab が undefined になる場合があるので注意
            // ※ Unchecked runtime.lastError while running tabs.get: No tab with id: 879. generated_background_page.html:1
            resolve( tab );
        } );
    } );
} // end of get_tab_info()


function register_tab( tab ) {
    load_tab_info();
    
    if ( ( ! tab ) || ( ! tab.id ) || ( TAB_MAP[ tab.id ] ) ) {
        return;
    }
    
    tab = {
        id : tab.id
    };
    
    TAB_MAP[ tab.id ] = tab;
    TAB_LIST.push( tab );
    
    save_tab_info();
} // end of register_tab()


function get_options( names, namespace ) {
    var options = {};
    
    if ( typeof names == 'string' ) {
        names = [ names ];
    }
    
    Array.apply( null, names ).forEach( function( name ) {
        name = String( name );
        options[ name ] = localStorage[ ( ( namespace ) ? ( String( namespace ) + '_' ) : '' ) + name ];
    } );
    
    log_debug( 'names=', names, 'options=', options );
    
    return options;
} // end of get_options()


function message_handler( message, sender, sendResponse ) {
    var type = message.type,
        response = null,
        names,
        namespace,
        options;
    
    log_debug( 'message_handler()', type, message, sender );
    
    
    switch ( type ) {
        case 'GET_OPTIONS' :
            names = message.names;
            namespace = message.namespace;
            response = options = get_options( names, namespace );
            
            register_tab( sender.tab );
            
            sendResponse( response );
            
            return;
        
        case 'PRINT_PREVIEW_REQUEST' :
            // [tabs.printPreview() - Mozilla | MDN](https://developer.mozilla.org/ja/Add-ons/WebExtensions/API/tabs/printPreview)
            // ※ 現状、Firefox のみサポート
            browser.tabs.printPreview()
                .then( function () {
                    sendResponse( {
                        type : 'PRINT_PREVIEW_REPONSE',
                        result : 'OK'
                    } );
                } )
                .catch( function () {
                    sendResponse( {
                        type : 'PRINT_PREVIEW_REPONSE',
                        result : 'ERROR'
                    } );
                } );
            
            return true; // 遅延して sendResponse() を呼ぶ場合、true を返す必要あり
        
        case 'OPTION_UPDATE_NOTICE' :
            names = message.names;
            namespace = message.namespace;
            options = get_options( names, namespace );
            
            response = {
                'result' : 'OK'
            };
            
            sendResponse( response );
            
            load_tab_info();
            
            Promise.all( TAB_LIST.map( function ( tab ) {
                return get_tab_info( tab.id );
            } ) )
            .then( function ( refreshed_tab_list ) {
                load_tab_info();
                
                TAB_LIST = refreshed_tab_list.filter( function ( tab ) {
                    log_debug( 'check tab=', tab );
                    
                    if ( ( ! tab ) || ( ! tab.id ) ) {
                        return false;
                    }
                    
                    //if ( tab.discarded ) {
                    //    delete TAB_MAP[ tab.id ];
                    //    return false;
                    //}
                    
                    log_debug( 'sendMessage to tab:', tab, options );
                    
                    browser.tabs.sendMessage( tab.id, {
                        type : 'OPTION_UPDATE_REQUEST',
                        options : options
                    }, function ( response ) {
                        log_debug( 'response from tab:', tab, response );
                    } );
                    
                    return true;
                } );
                
                save_tab_info();
            } );
            
            return;
    }
    
    sendResponse( response );
    
    return false;
} // end of message_handler()


function initialze() {
    log_debug( '*** initailize() [before]', TAB_LIST, TAB_MAP );
    
    TAB_LIST = [];
    TAB_MAP = {};
    
    save_tab_info();
    
    log_debug( '*** initailize() [after]', TAB_LIST, TAB_MAP );
    
    // アイコンの状態も初期化する
    var path_to_img = ( IS_EDGE ) ? 'img' : '../img',
        icon_path = ( get_bool( localStorage[ 'OPERATION' ] ) !== false ) ? ( path_to_img + '/icon_16.png' ) : ( path_to_img + '/icon_16-gray.png' );
    
    browser.browserAction.setIcon( { path : icon_path } );
    
} // end of initialze()


browser.runtime.onInstalled.addListener( initialze );
browser.runtime.onStartup.addListener( initialze );
browser.runtime.onMessage.addListener( message_handler );

// TODO: background.js が「 "persistent" : false 」で動いている場合、グローバル変数が保持されない
// → 暫定的に localStorage を介して読み書きする
load_tab_info();
log_debug( '*** background called ***', TAB_LIST, TAB_MAP );

} )();
