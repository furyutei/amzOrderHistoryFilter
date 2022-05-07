( function () {

'use strict';

if ( typeof browser == 'undefined' ) { window.browser = chrome; }


var CHECKBOX_INFO_LIST = [
        { name : 'OPEN_PRINT_DIALOG_AUTO', default_value : false },
        { name : 'REMOVE_REISSUE_STRINGS', default_value : false },
        { name : 'ADDRESSEE_CHANGEABLE', default_value : true },
        { name : 'ENABLE_PRINT_PREVIEW_BUTTON', default_value: true },
        { name : 'OPERATION', default_value : true }
    ],
    RADIO_INFO_LIST = [
    ],
    INT_INFO_LIST = [
    ],
    STR_INFO_LIST = [
    ],
    
    DEBUG = false,
    SCRIPT_NAME = 'options',
    
    IS_EDGE = ( 0 <= window.navigator.userAgent.toLowerCase().indexOf( 'edge' ) ),
    
    OPTION_NAMES = ( function () {
            var option_names = [];
            
            CHECKBOX_INFO_LIST.forEach( function( checkbox_info ) {
                option_names.push( checkbox_info.name );
            } );
            
            RADIO_INFO_LIST.forEach( function( radio_info ) {
                option_names.push( radio_info.name );
            } );
            
            INT_INFO_LIST.forEach( function( int_info ) {
                option_names.push( int_info.name );
            } );
            
            STR_INFO_LIST.forEach( function( str_info ) {
                option_names.push( str_info.name );
            } );
            
            return option_names;
        } )();


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


function send_option_update_notice( option_names ) {
    log_debug( 'send_option_update_notice()', option_names );
    
    browser.runtime.sendMessage( {
        type : 'OPTION_UPDATE_NOTICE'
    ,   names : option_names
    }, function ( response ) {
        log_debug( 'send_option_update_notice(): response=', response );
    } );
} // end of send_option_update_notice()


$( function () {
    function set_all_i18n() {
        STR_INFO_LIST.forEach( function( str_info ) {
            str_info.default_value = browser.i18n.getMessage( str_info.name );
        } );
        
        $( '.i18n' ).each( function () {
            var jq_elm = $( this ),
                value = ( jq_elm.val() ) || ( jq_elm.html() ),
                text = browser.i18n.getMessage( value );
            
            if ( ! text ) {
                return;
            }
            if ( ( value == 'OPTIONS' ) && ( 0 < jq_elm.parents( 'H1' ).length ) ) {
                jq_elm.parents( 'H1' ).find( 'a .version' ).text( 'version ' + browser.runtime.getManifest().version );
            }
            if ( jq_elm.val() ) {
                jq_elm.val( text );
            }
            else {
                jq_elm.html( text );
            }
        } );
        
    } // end of set_all_i18n()
    
    
    function set_operation_status( is_active ) {
        var path_to_img = ( IS_EDGE ) ? 'img' : '../img',
            icon_path = ( is_active ) ? ( path_to_img + '/icon_16.png' ) : ( path_to_img + '/icon_16-gray.png' );
        
        ( browser.browserAction || browser.action ).setIcon( { path : icon_path } );
    } // end of set_operation_status()
    
    
    function set_checkbox_event( info ) {
        function get_normalized_value( source_value ) {
            var bool_value = get_bool( source_value );
            
            if ( bool_value === null ) {
                return get_normalized_value( info.default_value );
            }
            return bool_value;
        } // end of get_normalized_value()
        
        
        function check_operation( name, bool_value ) {
            switch ( name ) {
                case 'OPERATION' :
                    set_operation_status( bool_value );
                    break;
            }
        } // end of check_operation()
        
        
        var name = info.name;
        
        get_value( name ).then( value => {
            var source_value = get_normalized_value( value ),
                jq_checkbox = $( 'input#' + name + ':checkbox' );
            
            jq_checkbox
                .unbind( 'change' )
                .prop( 'checked', source_value )
                .on( 'change', function () {
                    var bool_value = get_normalized_value( jq_checkbox.prop( 'checked' ) );
                    
                    set_value( name, bool_value ).then( () => {
                        check_operation( name, bool_value );
                        send_option_update_notice( name );
                    } );
                } );
            
            check_operation( name,  source_value );
        } );
    } // end of set_checkbox_event()
    
    
    function set_radio_event( info ) {
        function get_normalized_value( source_value ) {
            var bool_value = get_bool( source_value );
            
            if ( bool_value === null ) {
                return get_normalized_value( info.default_value );
            }
            return ( bool_value ) ? '1' : '0';
        }
        
        var name = info.name;
        
        get_value( name ).then( value => {
            var source_value = get_normalized_value( value ),
                jq_target = $( '#' + name ),
                jq_inputs = jq_target.find( 'input:radio' );
            
            jq_inputs
                .each( function () {
                    var jq_input = $( this ),
                        val = jq_input.val();
                    
                    if ( val === source_value ) {
                        jq_input.prop( 'checked', 'checked' );
                    }
                    else {
                        jq_input.prop( 'checked', false );
                    }
                } )
                .unbind( 'change' )
                .on( 'change', function () {
                    var jq_input = $( this );
                    
                    set_value( name, get_normalized_value( jq_input.val() ) ).then( () => {
                        send_option_update_notice( name );
                    } );
                } );
        } );
        
    } // end of set_radio_event()
    
    
    function set_int_event( info ) {
        function get_normalized_value( source_value ) {
            if ( isNaN( source_value ) ) {
                source_value = info.val;
            }
            else {
                source_value = parseInt( source_value );
                if ( ( ( info.min !== null ) && ( source_value < info.min ) ) || ( ( info.max !== null ) && ( info.max < source_value ) ) ) {
                    source_value = info.val;
                }
            }
            source_value = String( source_value );
            return source_value;
        }
        
        var name = info.name;
        
        get_value( name ).then( value => {
            var source_value = get_normalized_value( value ),
                jq_target = $( '#' + name ),
                jq_input = jq_target.find( 'input:text:first' ),
                jq_current = jq_target.find( 'span.current:first' );
            
            jq_current.text( source_value );
            jq_input.val( source_value );
            
            jq_target
                .find( 'input:button' )
                .unbind( 'click' )
                .on( 'click', function () {
                    var source_value = get_normalized_value( info, jq_input.val() );
                    
                    set_value( name, source_value ).then( () => {
                        jq_current.text( source_value );
                        jq_input.val( source_value );
                        send_option_update_notice( name );
                    } );
                } );
            
        } );
    } // end of set_int_event()
    
    
    function set_str_event( info ) {
        function get_normalized_value( info, source_value ) {
            if ( ! source_value ) {
                source_value = info.val;
            }
            else {
                source_value = String( source_value ).replace( /(?:^\s+|\s+$)/g, '' );
                if ( ! source_value ) {
                    source_value = info.val;
                }
            }
            return source_value;
        }
        
        var name = info.name;
        
        get_value( name ).then( value => {
            var source_value = get_normalized_value( info, value ),
                jq_target = $( '#' + name ),
                jq_input = jq_target.find( 'input:text:first' ),
                jq_current = jq_target.find( 'span.current:first' );
            
            jq_current.text( source_value );
            jq_input.val( source_value );
            
            jq_target
                .find( 'input:button' )
                .unbind( 'click' )
                .on( 'click', function () {
                    var source_value = get_normalized_value( info, jq_input.val() );
                    
                    set_value( name, source_value ).then( () => {
                        jq_current.text( source_value );
                        jq_input.val( source_value );
                        send_option_update_notice( name );
                    } );
                } );
        } );
    } // end of set_str_event()
    
    
    function set_static_events() {
        $( 'form' )
            .unbind( 'submit' )
            .on( 'submit', function () {
                return false;
            } );
        
        $( 'input[name="DEFAULT"]' )
            .unbind( 'click' )
            .on( 'click', function () {
                remove_values( OPTION_NAMES ).then( () => {
                    set_option_events( true );
                } );
                //location.reload();
            } );
        
        $( 'input[readonly]' )
            .unbind( 'click' )
            .on( 'click', function ( event ) {
                $( this ).select();
                try {
                    document.execCommand( 'copy' );
                }
                catch( error ) {
                }
            } );
        
    } // end of set_static_events()
    
    
    function set_option_events( update_notice_required ) {
        CHECKBOX_INFO_LIST.forEach( function( checkbox_info ) {
            set_checkbox_event( checkbox_info );
        } );
        
        RADIO_INFO_LIST.forEach( function( radio_info ) {
            set_radio_event( radio_info );
        } );
        
        INT_INFO_LIST.forEach( function( int_info ) {
            set_int_event( int_info );
        } );
        
        STR_INFO_LIST.forEach( function( str_info ) {
            set_str_event( str_info );
        } );
        
        if ( update_notice_required ) {
            send_option_update_notice( OPTION_NAMES );
        }
    } // end of set_option_events()
    
    
    set_all_i18n();
    set_static_events();
    set_option_events();
    
    // スライドスイッチのアニメーションが有効になるのを遅らせる
    // ※最初から設定してあると、デフォルトと異なる場合に、オプション画面を開く度にスライドアニメーションが走って煩わしい
    setTimeout( function () {
        $( 'label.slide-switch' ).addClass( 'ready' );
    }, 500 );
} );

} )();

// ■ end of file
