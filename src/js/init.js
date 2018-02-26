( function () {

'use strict';

if ( typeof browser == 'undefined' ) { window.browser = chrome; }


var DEBUG = false,
    SCRIPT_NAME = 'init';


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


function get_int( value ) {
    if ( isNaN( value ) ) {
        return null;
    }
    return parseInt( value, 10 );
} // end of get_int()


function get_text( value ) {
    if ( value === undefined ) {
        return null;
    }
    return String( value );
} // end of get_text()


function get_init_function( message_type, option_name_to_function_map, namespace ) {
    var option_names = [];
    
    Object.keys( option_name_to_function_map ).forEach( function ( option_name ) {
        option_names.push( option_name );
    } );
    
    
    function analyze_response( response ) {
        var options = {};
        
        if ( ! response ) {
            response = {};
        }
        
        Object.keys( option_name_to_function_map ).forEach( function ( option_name ) {
            if ( ! ( response.hasOwnProperty( option_name ) ) ) {
                options[ option_name ] = null;
                return;
            }
            options[ option_name ] =  option_name_to_function_map[ option_name ]( response[ option_name ] );
        } );
        return options;
    } // end of analyze_response()
    
    
    function set_uppdate_option_request_handler( on_update_callback ) {
        
        
        function message_handler( message, sender, sendResponse ) {
            var type = message.type,
                response = null;
            
            log_debug( 'message_handler()', type, message, sender );
            
            switch ( type ) {
                case 'OPTION_UPDATE_REQUEST':
                    var options = analyze_response( message.options );
                    
                    log_debug( 'message_handler(): options=', options );
                    
                    response = {
                        'result' : 'OK'
                    };
                    
                    sendResponse( response );
                    
                    if ( typeof on_update_callback == 'function' ) {
                        on_update_callback( options );
                    }
                    return;
            }
            
            sendResponse( response );
            
            return false;
        } // end of message_handler()
        
        
        browser.runtime.onMessage.addListener( message_handler );
    } // end of set_uppdate_option_request_handler()
    
    
    function init( callback, on_update_callback ) {
        log_debug( 'init()', callback, on_update_callback );
        
        browser.runtime.sendMessage( {
            type : message_type
        ,   names : option_names
        ,   namespace :  ( namespace ) ? namespace : ''
        }, function ( response ) {
            var options = analyze_response( response );
            
            log_debug( 'init(): call callback(), options=', options );
            
            set_uppdate_option_request_handler( on_update_callback );
            callback( options );
        } );
    }
    
    return init;
} // end of get_init_function()


var web_extension_init = ( function() {
    var option_name_to_function_map = {
            OPEN_PRINT_DIALOG_AUTO : get_bool,
            REMOVE_REISSUE_STRINGS : get_bool,
            ADDRESSEE_CHANGEABLE : get_bool,
            ENABLE_PRINT_PREVIEW_BUTTON : get_bool,
            OPERATION : get_bool
        };
    
    return get_init_function( 'GET_OPTIONS', option_name_to_function_map );
} )(); // end of web_extension_init()


window.web_extension_init = web_extension_init;
window.is_web_extension = true;

} )();