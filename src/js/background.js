( function ( window ) {
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


function get_values( key_list ) {
    return new Promise( function ( resolve, reject ) {
        if ( typeof key_list == 'string' ) {
            key_list = [ key_list ];
        }
        browser.storage.local.get( key_list, function ( items ) {
            resolve( items );
        } );
    } );
} // end of get_values()


async function get_value( key ) {
    var items = await get_values( [ key ] );
    return items[ key ];
} // end of get_value()


function set_value( key, value ) {
    return new Promise( function ( resolve, reject ) {
        browser.storage.local.set( {
            [ key ] : value
        }, function () {
            resolve();
        } );
    } );
} // end of set_value()


function remove_values( key_list ) {
    return new Promise( function ( resolve, reject ) {
        browser.storage.local.remove( key_list, function () {
            resolve();
        } );
    } );
} // end of remove_values()


async function save_tab_info() {
    log_debug( 'save_tab_info()', TAB_LIST, TAB_MAP );
    //localStorage.setItem( 'TAB_INFO', JSON.stringify( { tab_list : TAB_LIST, tab_map : TAB_MAP } ) );
    await set_value( 'TAB_INFO', JSON.stringify( { tab_list : TAB_LIST, tab_map : TAB_MAP } ) );
} // end of save_tab_info()


async function load_tab_info() {
    try {
        //var tab_info = JSON.parse( localStorage.getItem( 'TAB_INFO' ) );
        var tab_info = JSON.parse( await get_value( 'TAB_INFO' ) );
        
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
            // tab が undefined になる場合があるので注意
            // ※ Unchecked runtime.lastError while running tabs.get: No tab with id: 879. generated_background_page.html:1
            load_tab_info().then( () => {
                var callback = () => {
                        resolve( tab );
                    };
                
                if ( ( ! tab ) || ( ! tab.id ) ) {
                    delete TAB_MAP[ tab_id ];
                    save_tab_info().then( () => {
                        callback();
                    } );
                    return;
                }
                callback();
            } );
        } );
    } );
} // end of get_tab_info()


async function register_tab( tab ) {
    await load_tab_info();
    
    if ( ( ! tab ) || ( ! tab.id ) || ( TAB_MAP[ tab.id ] ) ) {
        return;
    }
    
    tab = {
        id : tab.id
    };
    
    TAB_MAP[ tab.id ] = tab;
    TAB_LIST.push( tab );
    
    await save_tab_info();
} // end of register_tab()


async function get_options( names, namespace ) {
    //var options = {};
    
    if ( typeof names == 'string' ) {
        names = [ names ];
    }
    
    /*
    //Array.apply( null, names ).forEach( function( name ) {
    //    name = String( name );
    //    options[ name ] = localStorage[ ( ( namespace ) ? ( String( namespace ) + '_' ) : '' ) + name ];
    //} );
    */
    var name_prefix = ( namespace ) ? ( String( namespace ) + '_' ) : '',
        names_with_namespace = Array.from( names ).map( name => name_prefix + name ),
        options = await get_values( names_with_namespace );
    
    log_debug( 'names_with_namespaces=', names_with_namespace, 'options=', options );
    
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
            get_options( names, namespace ).then( options => {
                response = options;
                register_tab( sender.tab ).then( () => {
                    sendResponse( response );
                } );
            } );
            return true;
        
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
            
            load_tab_info().then( () => {
                Promise.all( TAB_LIST.map( function ( tab ) {
                    return get_tab_info( tab.id );
                } ) )
                .then( function ( refreshed_tab_list ) {
                    load_tab_info().then( () => {
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
                } );
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
    
    save_tab_info().then( () => {
        log_debug( '*** initailize() [after]', TAB_LIST, TAB_MAP );
        
        // アイコンの状態も初期化する
        var path_to_img = ( IS_EDGE ) ? 'img' : '../img';
            //icon_path = ( get_bool( localStorage[ 'OPERATION' ] ) !== false ) ? ( path_to_img + '/icon_16.png' ) : ( path_to_img + '/icon_16-gray.png' );
        
        get_value( 'OPERATION' ).then( operation => {
            var icon_path = ( get_bool( operation ) !== false ) ? ( path_to_img + '/icon_16.png' ) : ( path_to_img + '/icon_16-gray.png' );
            ( browser.browserAction || browser.action ).setIcon( { path : icon_path } );
        } );
    } );
} // end of initialze()


browser.runtime.onInstalled.addListener( initialze );
browser.runtime.onStartup.addListener( initialze );
browser.runtime.onMessage.addListener( message_handler );

// TODO: background.js が「 "persistent" : false 」で動いている場合、グローバル変数が保持されない
// → 暫定的に localStorage を介して読み書きする
load_tab_info().then( () => {
    log_debug( '*** background called ***', TAB_LIST, TAB_MAP );
});
} )( typeof window !== 'undefined' ? window : self );
