// ==UserScript==
// @name            amzOrderHistoryFilter
// @namespace       http://furyu.hatenablog.com/
// @author          furyu
// @version         0.1.0.4
// @include         https://www.amazon.co.jp/gp/your-account/order-history*
// @include         https://www.amazon.co.jp/gp/digital/your-account/order-summary.html*
// @include         https://www.amazon.co.jp/gp/css/summary/print.html*
// @include         https://www.amazon.co.jp/ap/signin*
// @require         https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js
// @grant           GM_setValue
// @grant           GM_getValue
// @description     アマゾン(amazon.co.jp)の注文履歴を月別表示したり、月別もしくは通年の領収書をまとめて表示・印刷したりできるようになります。
// ==/UserScript==

/*
■ 外部ライブラリ
- [jQuery](https://jquery.com/)
    The MIT License
    [License | jQuery Foundation](https://jquery.org/license/)

■ 関連記事など
- [【アマゾン注文履歴フィルタ】Kindle 等のデジタルコンテンツの領収書をまとめて表示する拡張機能／アドオン／ユーザースクリプト](http://furyu.hatenablog.com/entry/amzOrderHistoryFilter)
- [furyutei/amzOrderHistoryFilter](https://github.com/furyutei/amzOrderHistoryFilter)
*/

/*
The MIT License (MIT)

Copyright (c) 2018 furyu <furyutei@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/


( function () {

'use strict';

// ■ パラメータ {
var OPTIONS = {
    OPEN_PRINT_DIALOG_AUTO : false, // true: 印刷ダイアログを自動で起動
    REMOVE_REISSUE_STRINGS : false, // true: 「再発行」を取り除く
    
    DEFAULT_FILTER_INCLUDE_DIGITAL : true, // フィルタ対象(デジタルコンテンツ)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_NONDIGITAL : false, // フィルタ対象(デジタルコンテンツ以外)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_RESERVATION : true, // フィルタ対象(予約)のデフォルト値(true: 有効)
    
    OPERATION : true // true: 動作中、false: 停止中
};

// }


// ■ 共通変数 {
var SCRIPT_NAME = 'amzOrderHistoryFilter',
    DEBUG = false;

if ( window[ SCRIPT_NAME + '_touched' ] ) {
    return;
}
window[ SCRIPT_NAME + '_touched' ] = true;


if ( typeof jQuery != 'function' ) {
    console.error( SCRIPT_NAME + ':', 'Library not found - ', 'jQuery:', typeof jQuery );
    return;
}

var $ = jQuery,
    IS_WEB_EXTENSION = !! ( window.is_web_extension ),
    IS_FIREFOX = ( 0 <= navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ),
    IS_EDGE = ( 0 <= navigator.userAgent.toLowerCase().indexOf( 'edge' ) ),
    WEB_EXTENSION_INIT = window[ SCRIPT_NAME + '_web_extension_init' ];


OPTIONS.SELECT_MONTH_LABEL_TEXT = '対象月選択';
OPTIONS.SELECT_MONTH_NO_SELECT_TEXT = '未選択';
OPTIONS.SELECT_MONTH_ALL_TEXT = '通年';
OPTIONS.CHECKBOX_FILTER_INCLUDE_DIGITAL_TEXT = 'デジタル';
OPTIONS.CHECKBOX_FILTER_INCLUDE_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.CHECKBOX_FILTER_INCLUDE_RESERVATION_TEXT = '予約分を含む';
OPTIONS.COUNTER_LABEL_DIGITAL_TEXT = 'デジタル';
OPTIONS.COUNTER_LABEL_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.PRINT_RECEIPT_BUTTON_TEXT = '領収書印刷用画面';
OPTIONS.LOGIN_REQUIRED_MESSAGE = 'サーバー側よりログインが要求されましたので、取得を中止します。';
OPTIONS.RECEIPT_READ_TIMEOUT_MESSAGE = '応答がないままタイムアウトしました。領収書の取得を最初からやり直します。';
OPTIONS.CSV_DOWNLOAD_BUTTON_TEXT = '注文履歴CSV(参考用)ダウンロード';


// }


// ■ 関数 {
function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


if ( typeof console.log.apply == 'undefined' ) {
    // MS-Edge 拡張機能では console.log.apply 等が undefined
    // → apply できるようにパッチをあてる
    // ※参考：[javascript - console.log.apply not working in IE9 - Stack Overflow](https://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9)
    
    [ 'log','info','warn','error','assert','dir','clear','profile','profileEnd' ].forEach( function ( method ) {
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


var set_value = ( function () {
    if ( typeof GM_setValue != 'undefined' ) {
        return function ( name, value ) {
            return GM_setValue( name, value );
        };
    }
    return function ( name, value ) {
        return localStorage.setItem( name, value );
    };
} )(); // end of set_value()


var get_value = ( function () {
    if ( typeof GM_getValue != 'undefined' ) {
        return function ( name ) {
            var value = GM_getValue( name );
            
            // メモ： 値が存在しない場合、GM_getValue( name ) は undefined を返す
            return ( value === undefined ) ? null : value;
        };
    }
    return function ( name ) {
        // メモ： 値が存在しない場合、localStorage[ name ] は undefined を、localStorage.getItem( name ) は null を返す
        return localStorage.getItem( name );
    };
} )(); // end of get_value()


var object_extender = ( function () {
    function object_extender( base_object ) {
        var template = object_extender.template;
        
        template.prototype = base_object;
        
        var expanded_object = new template(),
            object_list = to_array( arguments );
        
        object_list.shift();
        object_list.forEach( function ( object ) {
            Object.keys( object ).forEach( function ( name ) {
                expanded_object[ name ] = object[ name ];
            } );
        } );
        
        return expanded_object;
    } // end of object_extender()
    
    
    object_extender.template = function () {};
    
    return object_extender;
} )(); // end of object_extender()


function get_origin_url( url ) {
    if ( ! url ) {
        url = window.location.href;
    }
    
    try {
        return url.match(/^[^:]+:\/{2}[^/]+/)[ 0 ];
    }
    catch ( error ) {
        return url;
    }
} // end of get_origin_url()


function get_absolute_url( path, base_url ) {
    if ( ! base_url ) {
        base_url = window.location.href;
    }
    
    try {
        return new URL( path, base_url );
    }
    catch ( error ) {
        return path;
    }
} // end of get_absolute_url()


var open_child_window = ( function () {
    var child_window_counter = 0,
        jq_iframe_template = $( '<iframe/>' ).css( {
            'width' : '0',
            'height' : '0',
            'visibility' : 'hidden',
            'position' : 'absolute',
            'top' : '0',
            'left' : '0',
            'pointerEvents' : 'none'
        } );
    
    if ( DEBUG ) {
        jq_iframe_template.css( {
            'width' : '500px',
            'height' : '500px',
            'visibility' : 'visible'
        } );
    }
    
    return function ( url, options ) {
        if ( ! options ) {
            options = {};
        }
        
        var child_window = options.existing_window,
            name = '',
            open_parameters = ( options.open_parameters ) ? options.open_parameters : {};
        
        open_parameters.child_window_id = SCRIPT_NAME + '-' + ( new Date().getTime() ) + '-' + ( ++ child_window_counter ); // window.name が被らないように細工
        
        try {
            name = JSON.stringify( open_parameters );
        }
        catch ( error ) {
            log_debug( error );
        }
        
        if ( child_window ) {
            if ( child_window.name != name ) {
                child_window.name = name;
            }
            if ( child_window.location.href != url ) {
                child_window.location.href = url;
            }
        }
        else {
            if ( options.is_iframe ) {
                var jq_iframe = jq_iframe_template.clone();
                
                $( document.documentElement ).append( jq_iframe );
                
                child_window = jq_iframe[ 0 ].contentWindow;
                
                try {
                    child_window.name = name;
                    child_window.location.href = url;
                }
                catch ( error ) {
                    log_error( 'set failure', error );
                    
                    // TODO: MS-Edge 拡張機能だと、name が設定できないことがある
                    jq_iframe.attr( {
                        'name' : name,
                        'src' : url
                    } );
                }
            }
            else {
                child_window = window.open( url, name );
            }
        }
        
        return child_window;
    };
} )(); // end of open_child_window()


var get_jq_html_fragment = ( function () {
    if ( ( ! document.implementation ) || ( typeof document.implementation.createHTMLDocument != 'function' ) ) {
        return function ( html ) {
            return $( '<div/>' ).html( html );
        };
    }
    
    // 解析段階での余分なネットワークアクセス（画像等の読み込み）抑制
    var html_document = document.implementation.createHTMLDocument(''),
        range = html_document.createRange();
    
    return function ( html ) {
        return $( range.createContextualFragment( html ) );
    };
} )(); // end of get_jq_html_fragment()


function wait_for_rendering( callback, options ) {
    if ( ! options ) {
        options = {};
    }
    
    var min_wait_ms = ( options.min_wait_ms ) ? options.min_wait_ms : 3000,
        max_wait_ms = ( options.max_wait_ms ) ? options.max_wait_ms : 30000,
        target_element = ( options.target_element ) ? options.target_element : document.body,
        
        finish = function () {
            var is_timeover = false;
            
            if ( timeover_timer_id ) {
                var jq_payment_breakdown_container = $( '#docs-order-summary-payment-breakdown-container' );
                
                if ( 0 < jq_payment_breakdown_container.length ) {
                    // デジタルの領収書の場合、この部分を書き換えている→3秒待っても書き換え完了しない場合があるため、チェックしておく
                    if (
                        ( jq_payment_breakdown_container.children.length <= 0 ) ||
                        ( 0 < jq_payment_breakdown_container.find( '.a-popover-loading' ).length ) ||
                        ( jq_payment_breakdown_container.find( '.a-row .a-column' ).length <= 0 )
                    ) {
                        log_debug( '** payment information not found => retry' );
                        watch_timer_id = setTimeout( finish, min_wait_ms );
                        return;
                    }
                }
                watch_timer_id = null;
                
                clearTimeout( timeover_timer_id );
                timeover_timer_id = null;
            }
            else {
                is_timeover = true;
            }
            
            observer.disconnect();
            
            if ( typeof callback == 'function' ) {
                var jq_target = $( target_element ).clone();
                
                jq_target.find( 'script,iframe' ).remove();
                
                if ( OPTIONS.REMOVE_REISSUE_STRINGS ) {
                    var jq_receipt_header = jq_target.find( 'b.h1' ),
                        jq_reissue_receipt_date_label = jq_target.find( 'table:first table[align="center"]:first td[valign="top"][align="left"]:first b' );
                    
                    jq_receipt_header.text( jq_receipt_header.text().replace( /（再発行）/, '' ) );
                    jq_reissue_receipt_date_label.text( jq_reissue_receipt_date_label.text().replace( /^再/, '' ) );
                }
                
                callback( {
                    html : jq_target.html(),
                    is_timeover : is_timeover
                } );
            }
        }, // end of finish()
        
        timeover = function () {
            log_error( 'wait_for_rendering(): timeover' );
            
            timeover_timer_id = null;
            
            if ( watch_timer_id ) {
                clearTimeout( watch_timer_id );
                watch_timer_id = null;
            }
            
            finish();
        }, // end of timeover()
        
        observer = new MutationObserver( function ( records ) {
            if ( watch_timer_id ) {
                clearTimeout( watch_timer_id );
            }
            watch_timer_id = setTimeout( finish, min_wait_ms );
            
            log_debug( 'records.length=', records.length );
            
            if ( DEBUG ) {
                records.forEach( function ( record ) {
                    log_debug( record.target );
                } );
            }
        } ),
        
        watch_timer_id = setTimeout( finish, min_wait_ms ),
        timeover_timer_id = setTimeout( timeover, max_wait_ms );
    
    observer.observe( target_element, { childList : true, subtree : true } );
} // end of wait_for_rendering()

// }


// ■ オブジェクトテンプレート {
var TemplateLoadingDialog = {
    loading_icon_url : 'https://images-na.ssl-images-amazon.com/images/G/01/payments-portal/r1/loading-4x._CB338200758_.gif',
    
    
    init : function ( options ) {
        if ( ! options ) {
            options = {};
        }
        
        var self = this,
            jq_loading = $( '<div/>' ).addClass( SCRIPT_NAME + '-loading' ).css( {
                'width' : '100%',
                'height' : '100%',
                'background' : 'url(' + self.loading_icon_url + ') center center no-repeat'
            } ),
            jq_loading_dialog = self.jq_loading_dialog = $( '<div/>' ).addClass( SCRIPT_NAME + '-mask' ).css( {
                'display' : 'none',
                'position' : 'fixed',
                'top' : '0',
                'left' : '0',
                'z-index' : '10000',
                'width' : '100%',
                'height' : '100%',
                'background' : 'black',
                'opacity' : '0.5'
            } ).append( jq_loading );
        
        $( 'body' ).append( jq_loading_dialog );
        
        if ( options.counter_required ) {
            self.init_counter( options.max_number, options.initial_number );
        }
        
        return self;
    }, // end of init()
    
    
    show : function () {
        var self = this;
        
        self.jq_loading_dialog.show();
        self.counter_show();
        
        return self;
    }, // end of show()
    
    
    hide : function () {
        var self = this;
        
        self.counter_hide();
        self.jq_loading_dialog.hide();
        
        return self;
    }, // end of hide()
    
    
    init_counter : function ( max_number, initial_number ) {
        if ( ! initial_number ) {
            initial_number = 0;
        }
        
        var self = this,
            current_number = self.current_number = initial_number,
            jq_counter = self.jq_counter = $( '<div/>' ).addClass( 'counter' ).css( {
                'display' : 'none',
                'position' : 'fixed',
                'top' : '8px',
                'right' : '8px',
                'z-index' : '10001',
                'min-width' : '100px',
                'height' : '24px',
                'padding' : '2px 4px',
                'background' : 'white',
                'text-align' : 'center',
                'font-size' : '16px',
                'font-weight' : 'bolder',
                //'align-items' : 'center',
                //'justify-content' : 'center'
            } );
        
        self.max_number = max_number;
        self.initial_number = initial_number;
        
        self.counter_update_display();
        
        $( 'body' ).append( jq_counter );
        
        return self;
    }, // end of init_counter()
    
    
    counter_reset : function () {
        var self = this;
        
        self.current_number = self.initial_number;
        
        self.counter_update_display();
        
        return self;
    }, // end of counter_reset()
    
    
    counter_set : function ( number ) {
        var self = this;
        
        self.current_number = number;
        
        self.counter_update_display();
        
        return self;
    }, // end of counter_set()
    
    
    counter_increment : function () {
        var self = this;
        
        self.current_number ++;
        
        self.counter_update_display();
        
        return self;
    }, // end of counter_increment()
    
    
    counter_decrement : function () {
        var self = this;
        
        self.current_number --;
        
        self.counter_update_display();
        
        return self;
    }, // end of counter_decrement()
    
    
    counter_update_display : function () {
        var self = this,
            counter_text = '' + self.current_number;
        
        if ( self.max_number ) {
            counter_text += ' / ' + self.max_number;
        }
        
        self.jq_counter.text( counter_text );
        
        return self;
    }, // end of counter_update_display()
    
    
    counter_show : function () {
        var self = this;
        
        if ( self.jq_counter ) {
            //self.jq_counter.css( 'display', 'flex' );
            self.jq_counter.show();
        }
        
        return self;
    }, // end of counter_show()
    
    
    counter_hide : function () {
        var self = this;
        
        if ( self.jq_counter ) {
            self.jq_counter.hide();
        }
        
        return self;
    } // end of counter_hide()
    
}; // end of TemplateLoadingDialog


var TemplateOrderHistoryFilter = {
    filter_control_template : [
        '<div class="clearfix">',
        '  <div class="parameter-container">',
        '    <label><span class="month-label label"></span><select name="month"></select></label>',
        '    <label><input name="include-digital" type="checkbox" /><span class="include-digital-label label"></span></label>',
        '    <label><input name="include-nondigital" type="checkbox" /><span class="include-nondigital-label label"></span></label>',
        '    <label>(<input name="include-reservation" type="checkbox" /><span class="include-reservation-label label"></span>)</label>',
        '  </div>',
        '  <div class="message"></div>',
        '  <div class="operation-container">',
        '    <button name="print-receipt"></button>',
        '  </div>',
        '  <div class="counter-container">',
        '    <div class="counter digital"><span class="label"></span>:<span class="number">-</span></div>',
        '    <div class="counter nondigital"><span class="label"></span>:<span class="number">-</span></div>',
        '  </div>',
        '</div>'
    ].join( '\n' ),
    
    
    filter_option_keys : {
        include_digital : SCRIPT_NAME + '_include_digital',
        include_nondigital : SCRIPT_NAME + '_include_nondigital',
        include_reservation : SCRIPT_NAME + '_include_reservation',
    },
    
    
    init : function () {
        var self = this;
        
        try {
            if ( ! $( 'select#orderFilter' ).val().match( /^year-(\d{4})$/ ) ) {
                return self;
            }
        }
        catch ( error ) {
            log_error( error );
            return self;
        }
        
        var target_year = self.target_year = RegExp.$1,
            target_month = self.target_month = -1,
            order_information = self.order_information = {
                is_ready : false,
                month_order_info_lists : {},
                current_order_info_list : []
            },
            loading_dialog = self.loading_dialog = object_extender( TemplateLoadingDialog ).init();
        
        self.init_filter_options().init_filter_control();
        
        return self;
    }, // end of init()
    
    
    init_filter_options : function () {
        var self = this,
            filter_option_keys = self.filter_option_keys,
            filter_options = self.filter_options = {},
            init_value = function ( name, default_value ) {
                if ( get_value( filter_option_keys[ name ] ) !== null ) {
                    filter_options[ name ] = ( get_value( filter_option_keys[ name ] ) !== '0' );
                }
                else {
                    filter_options[ name ] = default_value;
                    set_value( filter_option_keys[ name ], ( filter_options[ name ] ) ? '1' : '0' );
                }
            }; // end of init_value()
        
        init_value( 'include_digital', OPTIONS.DEFAULT_FILTER_INCLUDE_DIGITAL );
        init_value( 'include_nondigital', OPTIONS.DEFAULT_FILTER_INCLUDE_NONDIGITAL );
        init_value( 'include_reservation', OPTIONS.DEFAULT_FILTER_INCLUDE_RESERVATION );
        
        return self;
    }, // end of init_filter_options()
    
    
    init_filter_control : function () {
        var self = this,
            month_number = 0,
            filter_options = self.filter_options,
            
            jq_filter_control = self.filter_control = $( self.filter_control_template ).attr( 'id', SCRIPT_NAME + '-filter-control' ).css( {
                'margin' : '0 0 4px 0'
            } ),
            
            jq_parameter_container = jq_filter_control.find( '.parameter-container' ).css( {
            } ),
            jq_select_month = self.jq_select_month = jq_parameter_container.find( 'select[name="month"]' ),
            jq_select_month_option_no_select = self.jq_select_month_option_no_select = $( '<option />' ).val( -1 ).text( OPTIONS.SELECT_MONTH_NO_SELECT_TEXT ).appendTo( jq_select_month ),
            jq_select_month_option_all = $( '<option />' ).val( 0 ).text( OPTIONS.SELECT_MONTH_ALL_TEXT ).appendTo( jq_select_month ),
            jq_select_month_option,
            
            jq_checkbox_include_digital = self.jq_checkbox_include_digital = jq_parameter_container.find( 'input[name="include-digital"]' ),
            jq_checkbox_include_nondigital = self.jq_checkbox_include_nondigital = jq_parameter_container.find( 'input[name="include-nondigital"]' ),
            jq_checkbox_include_reservation = self.jq_checkbox_include_reservation = jq_parameter_container.find( 'input[name="include-reservation"]' ),
            
            jq_counter_container = self.jq_counter_container = jq_filter_control.find( '.counter-container' ).css( {
                'color' : 'lightgray'
            } ),
            jq_counter_digital = jq_counter_container.find( '.counter.digital' ),
            jq_counter_nondigital = jq_counter_container.find( '.counter.nondigital' ),
            jq_counter_digital_number = self.jq_counter_digital_number = jq_counter_digital.find( '.number' ),
            jq_counter_nondigital_number = self.jq_counter_nondigital_number = jq_counter_nondigital.find( '.number' ),
            
            jq_operation_continer = jq_filter_control.find( '.operation-container' ).css( {
                'float' : 'right'
            } ),
            jq_button_print_receipt = self.jq_button_print_receipt = jq_operation_continer.find( 'button[name="print-receipt"]' ).text( OPTIONS.PRINT_RECEIPT_BUTTON_TEXT ).prop( 'disabled', 'disabled' ),
            
            jq_message = self.jq_message = jq_filter_control.find( '.message' ).css( {
                'color' : 'red',
                'font-weight' : 'bolder',
                'min-width' : '100px'
            } );
        
        jq_filter_control.find( 'label' ).css( {
            'display' : 'inline-block',
            'margin' : '0 4px'
        } );
        
        jq_filter_control.find( 'div' ).css( {
            'display' : 'inline-block'
        } );
        
        jq_filter_control.find( 'div.counter' ).css( {
            'font-weight' : 'bolder'
        } );
        
        jq_filter_control.find( 'span.label' ).css( {
            'margin' : '0 0 0 4px'
        } );
        
        jq_filter_control.find( 'span.month-label.label' ).css( {
            'margin' : '0 4px 0 0'
        } );
        
        jq_filter_control.find( 'span.number' ).css( {
            'margin' : '0',
            'display' : 'inline-block',
            'min-width' : '32px',
            'text-align' : 'center'
        } );
        
        jq_parameter_container.find( '.month-label' ).text( OPTIONS.SELECT_MONTH_LABEL_TEXT );
        jq_parameter_container.find( '.include-digital-label' ).text( OPTIONS.CHECKBOX_FILTER_INCLUDE_DIGITAL_TEXT );
        jq_parameter_container.find( '.include-nondigital-label' ).text( OPTIONS.CHECKBOX_FILTER_INCLUDE_NONDIGITAL_TEXT );
        jq_parameter_container.find( '.include-reservation-label' ).text( OPTIONS.CHECKBOX_FILTER_INCLUDE_RESERVATION_TEXT );
        
        jq_counter_digital.find( '.label' ).text( OPTIONS.COUNTER_LABEL_DIGITAL_TEXT );
        jq_counter_nondigital.find( '.label' ).text( OPTIONS.COUNTER_LABEL_NONDIGITAL_TEXT );
        
        for ( month_number = 12; 1 <= month_number ; month_number -- ) {
            jq_select_month_option = $( '<option />' ).val( month_number ).text( month_number ).appendTo( jq_select_month );
        }
        
        jq_select_month.val( -1 );
        
        if ( IS_EDGE ) {
            // MS-Edge では、なぜか jQuery の change イベントが発火しない
            jq_select_month[ 0 ].addEventListener( 'change', function ( event ) {
                self.onchange_month( event );
            } );
        }
        else {
            jq_select_month.change( function ( event ) {
                self.onchange_month( event );
            } );
        }
        
        jq_checkbox_include_digital
            .prop( 'checked', filter_options.include_digital )
            .change( function ( event ) {
                self.onchange_include_digital( event );
            } );
        
        jq_checkbox_include_nondigital
            .prop( 'checked', filter_options.include_nondigital )
            .change( function ( event ) {
                self.onchange_include_nondigital( event );
            } );
        
        jq_checkbox_include_reservation
            .prop( 'checked', filter_options.include_reservation )
            .change( function ( event ) {
                self.onchange_include_reservation( event );
            } );
        
        jq_button_print_receipt
            .click( function ( event ) {
                self.onclick_button_print_receipt( event );
            } );
        
        //$( '#controlsContainer .top-controls label[for="orderFilter"]' ).after( jq_filter_control );
        $( '#controlsContainer' ).append( jq_filter_control );
        
        return self;
    }, // end of init_filter_control()
    
    
    onchange_month : function ( event ) {
        var self = this,
            jq_select_month = self.jq_select_month;
        
        event.stopPropagation();
        event.preventDefault();
        
        jq_select_month.blur();
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_month()
    
    
    onchange_include_digital : function ( event ) {
        var self = this,
            filter_option_keys = self.filter_option_keys,
            filter_options = self.filter_options,
            jq_checkbox_include_digital = self.jq_checkbox_include_digital,
            is_checked = jq_checkbox_include_digital.is( ':checked' );
        
        event.stopPropagation();
        event.preventDefault();
        
        filter_options.include_digital = is_checked;
        set_value( filter_option_keys.include_digital, ( is_checked ) ? '1' : '0' );
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_include_digital()
    
    
    onchange_include_nondigital : function ( event ) {
        var self = this,
            filter_option_keys = self.filter_option_keys,
            filter_options = self.filter_options,
            jq_checkbox_include_nondigital = self.jq_checkbox_include_nondigital,
            is_checked = jq_checkbox_include_nondigital.is( ':checked' );
        
        event.stopPropagation();
        event.preventDefault();
        
        filter_options.include_nondigital = is_checked;
        set_value( filter_option_keys.include_nondigital, ( is_checked ) ? '1' : '0' );
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_include_nondigital()
    
    
    onchange_include_reservation : function ( event ) {
        var self = this,
            filter_option_keys = self.filter_option_keys,
            filter_options = self.filter_options,
            jq_checkbox_include_reservation = self.jq_checkbox_include_reservation,
            is_checked = jq_checkbox_include_reservation.is( ':checked' );
        
        event.stopPropagation();
        event.preventDefault();
        
        filter_options.include_reservation = is_checked;
        set_value( filter_option_keys.include_reservation, ( is_checked ) ? '1' : '0' );
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_include_reservation()
    
    
    onclick_button_print_receipt : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        if ( ! self.order_information.is_ready ) {
            return self;
        }
        
        self.open_order_receipts_for_print();
        
        return self;
    }, // end of onclick_button_print_receipt()
    
    
    update_order_container : function () {
        var self = this,
            jq_select_month = self.jq_select_month,
            target_month = self.target_month = parseInt( jq_select_month.val(), 10 ),
            order_information = self.order_information;
            
        if ( isNaN( target_month ) || ( target_month < 0 ) || ( 12 < target_month ) ) {
            return self;
        }
        
        if ( ! order_information.is_ready ) {
            self.get_order_information();
            
            return self;
        }
        
        var filter_options = self.filter_options,
            month_order_info_lists = order_information.month_order_info_lists,
            current_order_info_list = order_information.current_order_info_list = [],
            target_month_order_info_list = month_order_info_lists[ target_month ],
            jq_order_container = $( '#ordersContainer' ),
            jq_insert_point = jq_order_container.children( '.a-row:last' ),
            jq_counter_digital_number = self.jq_counter_digital_number,
            jq_counter_nondigital_number = self.jq_counter_nondigital_number,
            digital_counter = 0,
            nondigital_counter = 0,
            digital_reservation_counter = 0,
            nondigital_reservation_counter = 0,
            
            step_index_number = 10,
            lazy_index = step_index_number,
            
            on_scroll = function ( event ) {
                var jq_window = $ ( this ),
                    jq_document = $( document ),
                    index_counter = 0;
                
                if ( jq_document.height() < jq_document.scrollTop() + ( 2.0 * jq_window.height() )  ) {
                    for ( ; ( index_counter < step_index_number ) && ( lazy_index < current_order_info_list.length ); index_counter ++, lazy_index ++ ) {
                        current_order_info_list[ lazy_index ].jq_order.show();
                    }
                }
            }; // end of on_scroll()
        
        if ( ! target_month_order_info_list ) {
            return self;
        }
        
        self.loading_dialog.show();
        
        $( window ).off( 'scroll.update_order_container resize.update_order_container' );
        
        jq_order_container.find( '.order' ).remove();
        
        target_month_order_info_list.forEach( function ( order_info ) {
            if ( ( ! filter_options.include_digital ) && ( order_info.is_digital ) ) {
                return;
            }
            if ( ( ! filter_options.include_nondigital ) && ( ! order_info.is_digital ) ) {
                return;
            }
            if ( ( ! filter_options.include_reservation ) && ( order_info.is_reservation ) ) {
                return;
            }
            
            if ( order_info.is_digital ) {
                digital_counter ++;
                
                if ( order_info.is_reservation ) {
                    digital_reservation_counter ++;
                }
            }
            else {
                nondigital_counter ++;
                
                if ( order_info.is_reservation ) {
                    nondigital_reservation_counter ++;
                }
            }
            
            current_order_info_list.push( order_info );
            
            if ( current_order_info_list.length <= step_index_number ) {
                order_info.jq_order.show();
            }
            else {
                order_info.jq_order.hide();
            }
            
            if ( IS_EDGE ) {
                // MS-Edge で書影アイコンが二重に表示される→一つ目以外は隠す
                order_info.jq_order.find( '.item-view-left-col-inner a.a-link-normal' ).each( function () {
                    var jq_icon_link = $( this );
                    
                    jq_icon_link.find( 'img' ).slice( 1 ).hide();
                } );
            }
            
            jq_insert_point.before( order_info.jq_order );
        } );
        
        jq_counter_digital_number.text( digital_counter );
        jq_counter_nondigital_number.text( nondigital_counter );
        
        var scroll_top = $( window ).scrollTop();
        
        $( window ).scrollTop( scroll_top + 1 );
        // TODO: 注文内容を書き換えた際、スクロールさせないとサムネイル画像が表示されない→とりあえず強制的にスクロールさせておく
        
        setTimeout( function () {
            $( window ).scrollTop( scroll_top );
            
            self.loading_dialog.hide();
        }, 1 );
        
        $( window ).on( 'scroll.update_order_container resize.update_order_container', on_scroll );
        
        return self;
    }, // end of update_order_container()
    
    
    get_order_information : function () {
        var self = this,
            order_information = self.order_information,
            page_index = 0,
            max_page_index = 0,
            order_info_page_url_list = [],
            start_ms = new Date().getTime(),
            last_page_url = $( 'div.pagination-full ul.a-pagination li.a-normal:last a' ).attr( 'href' );
        
        if ( ! last_page_url ) {
            last_page_url = window.location.href;
        }
        
        if ( last_page_url.match( /[?&]startIndex=(\d+)/ ) ) {
            max_page_index = parseInt( RegExp.$1, 10 );
            
            for ( page_index = 0; page_index <= max_page_index; page_index += 10 ) {
                order_info_page_url_list.push( last_page_url.replace( /([?&]startIndex=)(\d+)/g, '$1' + page_index ) );
            }
        }
        else {
            order_info_page_url_list.push( last_page_url );
        }
        
        self.loading_dialog.show();
        
        self.jq_message.text( '' );
        
        self.fetch_all_html( order_info_page_url_list, function ( result ) {
            log_debug( 'elapsed time:', ( new Date().getTime() - start_ms ) / 1000, 's', result );
            
            if ( ! result.success ) {
                self.jq_message.text( result.error_message );
                self.loading_dialog.hide();
                return;
            }
            
            self.analyze_order_information( result.fetch_result_list );
            
            order_information.is_ready = true;
            self.jq_select_month_option_no_select.prop( 'disabled', true );
            self.jq_button_print_receipt.prop( 'disabled', false );
            self.jq_counter_container.css( 'color', 'gray' );
            
            $( 'div.pagination-full' ).hide();
            
            self.loading_dialog.hide();
            
            self.update_order_container();
        } );
        
        return self;
    },  // end of get_order_information()
    
    
    analyze_order_information : function ( order_info_page_fetch_result_list ) {
        var self = this,
            month_number = 0,
            
            order_information = self.order_information,
            month_order_info_lists = order_information.month_order_info_lists = {};
        
        
        for ( month_number = 0; month_number <= 12; month_number ++ ) {
            month_order_info_lists[ month_number ] = [];
        }
        
        order_info_page_fetch_result_list.forEach( function ( fetch_result ) {
            var jq_html_fragment = get_jq_html_fragment( fetch_result.html ),
                jq_orders = jq_html_fragment.find( '#ordersContainer .order' );
            
            jq_orders.each( function () {
                var jq_order = $( this ),
                    individual_order_info = self.get_individual_order_info( jq_order );
                
                month_order_info_lists[ 0 ].push( individual_order_info );
                month_order_info_lists[ individual_order_info.order_date_info.month ].push( individual_order_info );
            } );
        } );
        
        return self;
    }, // end of analyze_order_information()
    
    
    get_individual_order_info : function ( jq_order ) {
        var self = this,
            individual_order_info = {},
            jq_order_info = jq_order.find( '.order-info' ),
            jq_order_info_left = jq_order_info.find( '.a-col-left' ),
            order_date = jq_order_info_left.find( '.a-span3 .value' ).text().trim(),
            order_date_info = {},
            order_price = jq_order_info_left.find( '.a-span2 .value' ).text().trim(),
            order_price_number = ( typeof order_price == 'string' ) ? parseInt( order_price.replace( /[^\d.\-]/g, '' ), 10 ) : 0,
            jq_order_info_actions = jq_order_info.find( '.actions' ),
            order_id = jq_order_info_actions.find( '.a-size-mini .value' ).text().trim(),
            jq_order_info_actions_base = jq_order_info_actions.find( '.a-size-base' ),
            order_detail_url = jq_order_info_actions_base.find( 'a.a-link-normal:first' ).attr( 'href' ),
            order_receipt_url = jq_order_info_actions_base.find( '.hide-if-js a.a-link-normal' ).attr( 'href' ),
            jq_cancel_button = jq_order.find( 'a[role="button"][href*="/your-account/order-edit.html"][href*="type=e"],a[role="button"][href*="/order/edit.html"][href*="useCase=cancel"]' );
        
        if ( ( typeof order_date == 'string' ) && ( order_date.match( /^[^\d]*(\d+)[^\d]+(\d+)[^\d]+(\d+)[^\d]*$/ ) ) ) {
            order_date_info.year = parseInt( RegExp.$1, 10 );
            order_date_info.month = parseInt( RegExp.$2, 10 );
            order_date_info.date = parseInt( RegExp.$3, 10 );
        }
        
        if ( order_receipt_url ) {
            // /ref=oh_aui_dpi_o*_ になっていると、まれにページが読み込まれないことがある
            // → /ref=oh_aui_ajax_dpi に置換
             order_receipt_url = order_receipt_url.replace( /\/ref=oh_aui_.*?\?/, '/ref=oh_aui_ajax_dpi?' );
        }
        
        individual_order_info = {
            order_date : order_date,
            order_date_info : order_date_info,
            order_price : order_price,
            order_price_number : order_price_number,
            order_id : order_id,
            order_detail_url : order_detail_url,
            order_receipt_url : order_receipt_url,
            is_digital : ( order_receipt_url ) ? /\/gp\/digital\//.test( order_receipt_url ) : /^D/.test( order_id ),
            is_reservation : ( 0 < jq_cancel_button.length ),
            jq_order : jq_order
        };
        
        return individual_order_info;
    }, // end of get_individual_order_info()
    
    
    fetch_all_html : function ( url_list, callback ) {
        var self = this,
            jq_xhr_list = [];
        
        url_list.forEach( function ( url ) {
            var jq_xhr = $.ajax( {
                    url : get_absolute_url( url ),
                    type : 'GET',
                    dataType : 'html',
                    headers : { 'Accept' : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8" },
                    //beforeSend : function( xhr ) {
                    //    xhr.setRequestHeader( 'X-Requested-With', { toString : function () { return '';} } );
                    //},
                    crossDomain : true
                    // リクエストヘッダに X-Requested-With : XMLHttpRequest が含まれると、Amazon から HTML ではない形式で返されてしまう
                    // → crossDomain を true にして X-Requested-With を送信しないようにする
                    // ※参考: 
                    //   [jquery - can i remove the X-Requested-With header from ajax requests? - Stack Overflow](https://stackoverflow.com/questions/3372962/can-i-remove-the-x-requested-with-header-from-ajax-requests)
                    //   [javascript - jQueryのcrossDomainオプションが効かない - スタック・オーバーフロー](https://ja.stackoverflow.com/questions/5406/jquery%E3%81%AEcrossdomain%E3%82%AA%E3%83%97%E3%82%B7%E3%83%A7%E3%83%B3%E3%81%8C%E5%8A%B9%E3%81%8B%E3%81%AA%E3%81%84)
                } );
            
            jq_xhr_list.push( jq_xhr );
        } );
        
        $.when.apply( $, jq_xhr_list )
            .then( function () {
                var xhr_result_list = [],
                    fetch_result_list = [];
                
                if ( jq_xhr_list.length == 1 ) {
                    xhr_result_list = [ arguments ];
                }
                else if ( 1 < jq_xhr_list.length ) {
                    xhr_result_list = to_array( arguments );
                }
                
                xhr_result_list.forEach( function ( xhr_result, index ) {
                    fetch_result_list.push( {
                        url : url_list[ index ],
                        html : xhr_result[ 0 ],
                        textStatus : xhr_result[ 1 ],
                        jqXHR : xhr_result[ 2 ]
                    } );
                } );
                
                callback( {
                    success : true,
                    fetch_result_list : fetch_result_list
                } );
            } )
            .fail( function ( error ) {
                log_error( error.statusText );
                
                callback( {
                    success : false,
                    error_message : 'Fetch Failure'
                } );
            } );
        
        return self;
    }, // end of fetch_all_html()
    
    
    open_order_receipts_for_print : function () {
        var self = this,
            order_information = self.order_information,
            current_order_info_list = order_information.current_order_info_list,
            digital_order_urls = [],
            nondigital_order_urls = [],
            print_digital = true,
            print_nondigital = true,
            show_print_dialog = true;
        
        current_order_info_list.forEach( function ( order_info ) {
            var order_receipt_url = order_info.order_receipt_url;
            
            if ( order_receipt_url ) {
                if ( order_info.is_digital ) {
                    digital_order_urls.push( order_receipt_url );
                }
                else {
                    nondigital_order_urls.push( order_receipt_url );
                }
            }
        } );
        
        digital_order_urls.reverse();
        nondigital_order_urls.reverse();
        
        if ( digital_order_urls.length <= 0 ) {
            print_digital = false;
        }
        
        if ( nondigital_order_urls.length <= 0 ) {
            print_nondigital = false;
        }
        
        if ( print_digital &&  print_nondigital ) {
            // TODO: 両方で印刷ダイアログを表示しようとしても、先に表示されたダイアログを閉じるまで、もう片方が動作しなくなる
            show_print_dialog = false;
        }
        
        if ( print_nondigital ) {
            var nondigital_first_order_url = nondigital_order_urls.shift();
           
            open_child_window( self.get_signin_url( nondigital_first_order_url ), {
                open_parameters : {
                    target_year : self.target_year,
                    target_month : self.target_month,
                    is_digital : false,
                    first_order_url : nondigital_first_order_url,
                    additional_order_urls : nondigital_order_urls,
                    show_print_dialog : show_print_dialog
                }
            } );
        }
        
        if ( print_digital ) {
            var digital_first_order_url = digital_order_urls.shift();
           
            open_child_window( self.get_signin_url( digital_first_order_url ), {
                open_parameters : {
                    target_year : self.target_year,
                    target_month : self.target_month,
                    is_digital : true,
                    first_order_url : digital_first_order_url,
                    additional_order_urls : digital_order_urls,
                    show_print_dialog : show_print_dialog
                }
            } );
        }
        
        return self;
    }, // end of open_order_receipts_for_print()
    
    
    // 領収書読込中に認証を要求されてしまう場合がある
    // → 開始時に予め強制的に認証させる
    // ※参考：[Final: OpenID Provider Authentication Policy Extension 1.0](http://openid.net/specs/openid-provider-authentication-policy-extension-1_0.html#anchor8)
    get_signin_url : ( function () {
        var signin_base_url = [
                'https://www.amazon.co.jp/ap/signin?_encoding=UTF8',
                'accountStatusPolicy=P1',
                'showRmrMe=1',
                'openid.assoc_handle=jpflex',
                'openid.claimed_id=' + encodeURIComponent( 'http://specs.openid.net/auth/2.0/identifier_select' ),
                'openid.identity=' + encodeURIComponent( 'http://specs.openid.net/auth/2.0/identifier_select' ),
                'openid.mode=checkid_setup',
                'openid.ns=' + encodeURIComponent( 'http://specs.openid.net/auth/2.0' ),
                'openid.ns.pape=' + encodeURIComponent( 'http://specs.openid.net/extensions/pape/1.0' ),
                'openid.pape.max_auth_age=0', // 認証有効時間(秒)（元の値は 900 → 0 の場合、強制的に認証用のログイン画面が開く）
                'openid.return_to='
            ].join( '&' );
        
        return function ( return_to_url ) {
            var signin_page_url = signin_base_url + encodeURIComponent( get_absolute_url( return_to_url ) );
            
            log_debug( '** signin_page_url =', signin_page_url );
            
            return signin_page_url;
        };
    } )() // end of get_signin_url()

}; // end of TemplateOrderHistoryFilter


var TemplateReceiptOutputPage = {
    timeout_ms : 60000,
    limit_parallel_request_number : 10,
    
    jq_header_template : $( '<h2 class="receipt noprint"><a/></h2>' ),
    jq_hr_template : $( '<hr class="receipt"/>' ),
    
    csv_header_columns : [ "注文日", "注文番号", "商品名", "付帯情報", "価格", "個数", "商品小計", "注文合計", "状態", "請求額", "クレカ請求日", "クレカ請求額", "クレカ種類", "注文概要URL", "領収書URL", "商品URL" ],
    
    init : function ( open_parameters ) {
        var self = this,
            loading_dialog = self.loading_dialog = object_extender( TemplateLoadingDialog ).init( {
                counter_required : true,
                max_number : 1 + open_parameters.additional_order_urls.length
            } ).show(),
            jq_body = self.jq_body = $( 'body' ),
            
            url_to_page_info = self.url_to_page_info = {},
            
            remaining_request_order_urls = self.remaining_request_order_urls = open_parameters.additional_order_urls.slice( 0 );
        
        self.open_parameters = open_parameters;
        self.result_waiting_counter = 1 + open_parameters.additional_order_urls.length;
        self.current_receipt_number = 1;
        self.request_counter = 0;
        
        self.is_reloading = false;
        
        self.timeout_timer_id = null;
        self.reset_timeout_timer();
        
        self.jq_csv_download_link = null;
        
        $( '<style type="text/css"/>' )
            .text( [
                'h2.receipt a {font-size:14px;}',
                '@media print {',
                '  .noprint { display: none; }',
                '  hr.receipt { page-break-after: always; margin: 0 0 0 0; padding: 0 0 0 0; height: 0; border: none; visibility: hidden; }',
                '}'
            ].join( '\n' ) )
            .appendTo( $( 'head' ) );
        
        self.create_jq_header( self.current_receipt_number, open_parameters.first_order_url ).prependTo( jq_body );
        
        $( window ).on( 'message', function ( event ) {
            self.on_receive_message( event );
        } );
        
        url_to_page_info[ open_parameters.first_order_url ] = {
            receipt_number : self.current_receipt_number
        };
        
        for ( self.request_counter = 0; self.request_counter < self.limit_parallel_request_number; self.request_counter ++ ) {
            var request_order_url = remaining_request_order_urls.shift();
            
            if ( ! request_order_url ) {
                break;
            }
            
            self.current_receipt_number ++;
            
            self.call_by_iframe( request_order_url, self.current_receipt_number );
        }
        
        wait_for_rendering( function ( result ) {
            self.on_rendering_complete( result.html );
        } );
        
        return self;
    }, // end of init()
    
    
    reset_timeout_timer : function () {
        var self = this;
        
        if ( self.timeout_timer_id ) {
            clearTimeout( self.timeout_timer_id );
        }
        
        self.timeout_timer_id = setTimeout( function () {
            self.on_timeout();
        }, self.timeout_ms );
        
        return self;
    }, // end of reset_timeout_timer()
    
    
    create_jq_header : function ( receipt_number, receipt_url ) {
        var self = this,
            jq_header = self.jq_header_template.clone(),
            jq_link = jq_header.find( 'a' ).attr( {
                'href' : receipt_url,
                'target' : '_blank'
            } ).text( 'No.' + receipt_number );
        
        return jq_header;
    }, // end of create_jq_header()
    
    
    create_jq_receipt_body : function ( html, receipt_number, receipt_url ) {
        var self = this;
        
        return $( '<div/>' ).html( html ).prepend( self.create_jq_header( receipt_number, receipt_url ) ).prepend( self.jq_hr_template.clone() );
    }, // end of create_jq_receipt_body()
    
    
    call_by_iframe : function ( request_order_url, receipt_number, existing_window ) {
        var self = this,
            child_window = open_child_window( request_order_url, {
                is_iframe : true,
                existing_window : existing_window,
                open_parameters : {
                    first_order_url : self.open_parameters.first_order_url,
                    request_order_url : request_order_url
                }
            } );
        
        self.url_to_page_info[ request_order_url ] = {
            receipt_number : receipt_number,
            child_window : child_window
        };
        
        return self;
    }, // end of call_by_iframe()
    
    
    on_rendering_complete : function ( html ) {
        var self = this,
            open_parameters = self.open_parameters,
            jq_body = self.jq_body,
            page_info = self.url_to_page_info[ open_parameters.first_order_url ];
        
        log_debug( '*** on_rendering_complete: result_waiting_counter=', self.result_waiting_counter );
        
        self.reset_timeout_timer();
        
        page_info.html = html;
        page_info.jq_receipt_body = self.create_jq_receipt_body( html, page_info.receipt_number, open_parameters.first_order_url );
        page_info.order_parameters = self.get_order_parameters( page_info.jq_receipt_body );
        
        self.loading_dialog.counter_increment();
        self.result_waiting_counter --;
        
        if ( OPTIONS.REMOVE_REISSUE_STRINGS ) {
            var jq_receipt_header = jq_body.find( 'b.h1' ),
                jq_reissue_receipt_date_label = jq_body.find( 'table:first table[align="center"]:first td[valign="top"][align="left"]:first b' );
            
            jq_receipt_header.text( jq_receipt_header.text().replace( /（再発行）/, '' ) );
            jq_reissue_receipt_date_label.text( jq_reissue_receipt_date_label.text().replace( /^再/, '' ) );
        }
        
        if ( self.result_waiting_counter <= 0 ) {
            self.finish();
        }
        
        return self;
    }, // end of on_rendering_complete()
    
    
    on_receive_message : function ( jq_event ) {
        var self = this,
            event = jq_event.originalEvent,
            url_to_page_info = self.url_to_page_info;
        
        log_debug( '*** on_receive_message: result_waiting_counter=', self.result_waiting_counter, 'event=', event );
        
        self.reset_timeout_timer();
        
        if ( event.origin != get_origin_url() ) {
            log_error( 'origin error:', event.origin );
            return;
        }
        
        var error = event.data.error,
            signin_request = event.data.signin_request,
            request_order_url = event.data.request_order_url,
            page_info = self.url_to_page_info[ request_order_url ];
        
        if ( ! page_info ) {
            return;
        }
        
        if ( event.data.error ) {
            log_error( event.data.error_message );
            
            if ( ( ! self.is_reloading ) && event.data.signin_request ) {
                log_error( 'sign-in required' );
                
                self.loading_dialog.hide();
                
                self.is_reloading = true;
                
                if ( confirm( OPTIONS.LOGIN_REQUIRED_MESSAGE ) ) {
                    window.location.reload( true );
                    return;
                }
            }
        }
        
        page_info.html = event.data.html;
        page_info.jq_receipt_body = self.create_jq_receipt_body( event.data.html, page_info.receipt_number, request_order_url );
        page_info.order_parameters = self.get_order_parameters( page_info.jq_receipt_body );
        
        self.loading_dialog.counter_increment();
        self.result_waiting_counter --;
        
        if ( self.result_waiting_counter <= 0 ) {
            self.finish();
        }
        
        request_order_url = self.remaining_request_order_urls.shift();
        
        if ( ! request_order_url ) {
            return;
        }
        
        self.current_receipt_number ++;
        
        self.call_by_iframe( request_order_url, self.current_receipt_number, page_info.child_window );
        
        return self;
    }, // end of on_receive_message()
    
    
    on_timeout : function () {
        var self = this;
        
        log_error( 'receipt read timeout' );
        
        self.loading_dialog.hide();
        
        if ( ! self.is_reloading ) {
            self.is_reloading = true;
            
            if ( confirm( OPTIONS.RECEIPT_READ_TIMEOUT_MESSAGE ) ) {
                window.location.reload( true );
            }
        }
    }, // end of on_timeout()
    
    
    onclick_csv_download_button : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.download_csv();
        
        return self;
    }, // end of onclick_csv_download_button()
    
    
    finish :  function () {
        var self = this,
            open_parameters = self.open_parameters,
            jq_body = self.jq_body,
            url_to_page_info = self.url_to_page_info;
        
        if ( self.timeout_timer_id ) {
            clearTimeout( self.timeout_timer_id ) ;
            self.timeout_timer_id = null;
        }
        
        open_parameters.additional_order_urls.forEach( function ( additional_order_url ) {
            jq_body.append( url_to_page_info[ additional_order_url ].jq_receipt_body.children() );
        } );
        
        self.create_csv_download_button();
        
        self.loading_dialog.hide();
        
        if ( open_parameters.show_print_dialog ) {
            if ( OPTIONS.OPEN_PRINT_DIALOG_AUTO ) {
                window.print();
            }
        }
        
        return self;
    }, // end of finish()
    
    
    get_order_parameters : function ( jq_receipt_body ) {
        var self = this,
            order_parameters = {};
        
        if ( self.open_parameters.is_digital ) {
            order_parameters = self.get_order_parameters_digital( jq_receipt_body );
        }
        else {
            order_parameters = self.get_order_parameters_nondigital( jq_receipt_body );
        }
        
        return order_parameters;
    }, // end of get_order_parameters()
    
    
    get_order_parameters_digital : function ( jq_receipt_body ) {
        var self = this,
            order_parameters = {},
            order_date = '',
            order_id = '',
            item_list = [],
            order_subtotal_price = '',
            order_total_price = '',
            order_status = '',
            order_billing_amount = '',
            card_info = {
                card_type : '',
                card_billing_date : '',
                card_billing_amount : ''
            },
            order_url = '',
            receipt_url = '',
            
            jq_order_summary = jq_receipt_body.find( '.orderSummary:first' ),
            jq_order_summary_header = jq_order_summary.find( 'table:eq(0)' ),
            jq_order_summary_content = jq_order_summary.find( 'table.sample' ),
            jq_payment_summary = jq_receipt_body.children( 'table.sample' ).find( '#docs-order-summary-payment-breakdown-container' );
        
        order_date = self.get_formatted_date_string( self.get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文日")):first' ) ) );
        order_id = self.get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文番号")):first' ) );
        
        jq_order_summary_content.find( 'table table tr:gt(0)' ).each( function () {
            var jq_item = $( this ),
                jq_item_info = jq_item.find( 'td[align="left"]' ),
                jq_item_price = jq_item.find( 'td[align="right"]' );
            
            if ( ( jq_item_info.length <= 0 ) || ( jq_item_price.length <= 0 ) ) {
                return;
            }
            
            var jq_item_name = jq_item_info.find( 'b:first' ),
                jq_item_link = jq_item_name.find( 'a' );
            
            item_list.push( {
                name : jq_item_name.text().trim(),
                remarks : self.get_child_text_from_jq_element( jq_item_info ),
                price : self.get_price_number( self.get_child_text_from_jq_element( jq_item_price ) ),
                number : 1,
                url : ( 0 < jq_item_link.length ) ? get_absolute_url( jq_item_link.attr( 'href' ) ) : ''
            } );
        } );
        
        order_subtotal_price = self.get_price_number( self.get_child_text_from_jq_element( jq_order_summary_content.find( 'tr:last td[colspan][align="right"]:contains("商品小計")' ) ) );
        order_total_price = self.get_price_number( self.get_child_text_from_jq_element( jq_order_summary_header.find( 'b:contains("注文の合計")' ) ) );
        
        if ( 0 < jq_payment_summary.length  ) {
            // 新しい(2014/04頃以降の)ものは、<!-- BEGIN ViewPaymentPlanSummary WIDGET --> というマークが入っている
            // ※ Amazonアプリストアなど、一部旧式のままのものもある模様
            
            order_billing_amount = self.get_price_number( self.get_child_text_from_jq_element( jq_payment_summary.find( '.pmts-summary-preview-single-item-total .a-color-price' ) ) );
            
            var jq_card_type = jq_payment_summary.find( 'table.pmts_payment_method_table .pmts_view_payment_plan_payment_method .pmts-aui-account-number-display:last .pmts-inst-tail' );
            
            card_info.card_type = jq_card_type.text().trim();
            card_info.card_billing_amount = self.get_price_number( self.get_child_text_from_jq_element( jq_card_type.parents( 'tr:first' ).find( '.pmts_view_payment_plan_payment_method_coverage_amount' ) ) );
        }
        else {
            // 古い領収書の場合、支払い情報欄のフォーマットが異なる(2014/04頃を境に変化)
            
            jq_payment_summary = jq_receipt_body.children( 'table.sample' ).find( 'table tr' );
            order_billing_amount =  self.get_price_number( self.get_child_text_from_jq_element( jq_payment_summary.find( 'td[align="right"] > b:contains("総計")' ) ) );
            
            var b_counter = 0,
                card_type_text = '';
            
            jq_payment_summary.find( 'td:eq(0)' ).contents().each( function () {
                if ( ( this.nodeType == 1 ) && ( this.tagName == 'B' ) ) {
                    b_counter ++;
                    
                    if ( 2 <= b_counter ) {
                        return false;
                    }
                    return;
                }
                
                if ( ( 0 < b_counter ) && ( this.nodeType == 3 ) ) {
                    card_type_text += this.nodeValue.trim();
                }
            } );
            
            card_info.card_type = card_type_text.trim();
        }
        
        order_status = self.get_child_text_from_jq_element( jq_order_summary_content.find( 'tr:first td[align="center"] font b' ) );
        
        order_url = get_absolute_url( jq_receipt_body.children( 'center:eq(-1)' ).find( 'p > a' ).attr( 'href' ) );
        receipt_url = get_absolute_url( jq_receipt_body.children( 'h2.receipt' ).find( 'a' ).attr( 'href' ) );
        
        order_parameters = {
            order_date : order_date,
            order_id : order_id,
            item_list : item_list,
            order_subtotal_price : order_subtotal_price,
            order_total_price : order_total_price,
            order_status : order_status,
            order_billing_amount : order_billing_amount,
            card_info : card_info,
            order_url : order_url,
            receipt_url : receipt_url
        };
        
        log_debug( 'order_parameters', order_parameters );
        
        return order_parameters;
    }, // end of get_order_parameters_digital()
    
    
    get_order_parameters_nondigital : function ( jq_receipt_body ) {
        var self = this,
            order_parameters = {},
            order_date = '',
            order_id = '',
            item_group_list = [],
            order_subtotal_price = '',
            order_total_price = '',
            order_billing_amount = '',
            order_url = '',
            receipt_url = '',
            
            card_info_list = [],
            
            jq_order_container = jq_receipt_body.find( 'table:eq(0) > tbody > tr > td' ),
            jq_order_summary_header = jq_order_container.children( 'table:eq(0)' ),
            jq_order_summary_content_list = jq_order_container.children( 'table:gt(0):lt(-1)' ),
            jq_payment_content = jq_order_container.children( 'table:eq(-1)' ).find( 'table > tbody' ),
            jq_payment_total = jq_payment_content.children( 'tr:eq(1)' ).find( 'table > tbody > tr > td[align="right"]' ),
            jq_payment_card_info_list = jq_payment_content.children( 'tr:eq(2)' ).find( 'table table tr' );
        
        order_date = self.get_formatted_date_string( self.get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文日")):first' ) ) );
        order_id = self.get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文番号")):first' ) );
        
        jq_payment_card_info_list.each( function () {
            var jq_payment_card_info = $( this ),
                card_info_parts = self.get_child_text_from_jq_element( jq_payment_card_info.find( 'td:eq(0)') ).split( ':' ),
                card_type = '',
                card_billing_date = '',
                card_billing_amount = '';
            
            if ( card_info_parts.length == 3 ) {
                card_type = card_info_parts[ 0 ].trim();
                card_billing_date = self.get_formatted_date_string( card_info_parts[ 1 ] );
            }
            card_billing_amount = self.get_price_number( self.get_child_text_from_jq_element( jq_payment_card_info.find( 'td:eq(1)') ) );
            
            card_info_list.push( {
                card_type : card_type,
                card_billing_date : card_billing_date,
                card_billing_amount : card_billing_amount
            } );
        } );
        
        jq_order_summary_content_list.each( function () {
            var item_list = [],
                jq_order_summary_content = $( this ).find( 'table > tbody' ),
                jq_order_summary_items = jq_order_summary_content.children( 'tr:eq(1)' ).find( 'table:eq(0) td:eq(0) table:eq(1) tr:gt(0)' ),
                jq_order_summary_total = jq_order_summary_content.children( 'tr:eq(2)' ).find( 'table > tbody > tr > td[align="right"]' ),
                status = self.get_child_text_from_jq_element( jq_order_summary_content.children( 'tr:eq(0)' ).find( 'b.sans center' ) ),
                status_date = self.get_formatted_date_string( status ),
                status_date_ms = ( status_date ) ? new Date( status_date ).getTime() : 0,
                subtotal_price = self.get_price_number( self.get_child_text_from_jq_element( jq_order_summary_total.find( 'tr:has(td[align="right"]:contains("商品の小計")) > td[align="right"]:eq(-1)' ) ) ),
                total_price = self.get_price_number( self.get_child_text_from_jq_element( jq_order_summary_total.find( 'tr:has(td[align="right"]:contains("注文合計")) > td[align="right"]:eq(-1)' ) ) ),
                billing_amount = self.get_price_number( self.get_child_text_from_jq_element( jq_order_summary_total.find( 'tr:has(td[align="right"] > b:contains("ご請求額")) > td[align="right"]:eq(-1) b' ) ) ),
                card_info = {
                    card_type : '',
                    card_billing_date : '',
                    card_billing_amount : ''
                },
                min_time_lag_ms = 31622400000;// 366 * 24 * 60 * 60 * 1000
            
            jq_order_summary_items.each( function() {
                var jq_item = $( this ),
                    jq_item_info = jq_item.find( 'td:eq(0)' ),
                    jq_item_price = jq_item.find( 'td:eq(1)' ),
                    remarks = '',
                    orig_remarks = '',
                    number = 1;
                
                if ( ( jq_item_info.length <= 0 ) || ( jq_item_price.length <= 0 ) ) {
                    return;
                }
                
                orig_remarks = ( self.get_child_text_from_jq_element( jq_item_info ) + ' ' + self.get_child_text_from_jq_element( jq_item_info.find( '.tiny' ) ).replace( /\(\s*\)/, '' ) ).trim();
                remarks = orig_remarks.replace( /^(\d+)\s*点\s*,?\s*/, '' );
                
                if ( remarks != orig_remarks ) {
                    number = parseInt( RegExp.$1, 10 );
                }
                
                item_list.push( {
                    name : self.get_child_text_from_jq_element( jq_item_info.find( 'i' ) ),
                    remarks : remarks,
                    price : self.get_price_number( self.get_child_text_from_jq_element( jq_item_price ) ),
                    number : number,
                    url : ''
                } );
            } );
            
            if ( billing_amount !== '' ) {
                $.each( card_info_list, function ( index, temp_card_info ) {
                    // TODO: カード請求が同じ金額で複数ある場合におかしくなってしまう（発送日と請求日にもずれがある）
                    // → とりあえず、発送日と請求日の差が一番小さいものを選択することにして、様子見
                    if ( temp_card_info.card_billing_amount == billing_amount ) {
                        if ( ( ! status_date ) || ( ! temp_card_info.card_billing_date ) ) {
                            card_info = temp_card_info;
                            return;
                        }
                        
                        var time_lag_ms = Math.abs( new Date( temp_card_info.card_billing_date ).getTime() - status_date_ms );
                        
                        if ( time_lag_ms < min_time_lag_ms ) {
                            min_time_lag_ms = time_lag_ms;
                            card_info = temp_card_info;
                        }
                    }
                } );
            }
            
            item_group_list.push( {
                item_list : item_list,
                subtotal_price : subtotal_price,
                total_price : total_price,
                status : status,
                billing_amount : billing_amount,
                card_info : card_info
            } );
        } );
        
        order_subtotal_price = self.get_price_number( self.get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"]:contains("商品の小計")) > td[align="right"]:eq(-1)' ) ) );
        order_total_price = self.get_price_number( self.get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"]:contains("注文合計")) > td[align="right"]:eq(-1)' ) ) );
        order_billing_amount = self.get_price_number( self.get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"] > b:contains("ご請求額")) > td[align="right"]:eq(-1) b' ) ) );
        
        order_url = get_absolute_url( jq_receipt_body.children( 'center:eq(-1)' ).find( 'p > a' ).attr( 'href' ) );
        receipt_url = get_absolute_url( jq_receipt_body.children( 'h2.receipt' ).find( 'a' ).attr( 'href' ) );
        
        order_parameters = {
            order_date : order_date,
            order_id : order_id,
            item_group_list : item_group_list,
            order_subtotal_price : order_subtotal_price,
            order_total_price : order_total_price,
            order_billing_amount : order_billing_amount,
            order_url : order_url,
            receipt_url : receipt_url
        };
        
        log_debug( 'order_parameters', order_parameters );
        
        return order_parameters;
    }, // end of get_order_parameters_nondigital()
    
    
    get_formatted_date_string : function ( source_date_string ) {
        if ( ( ! source_date_string ) || ( ! source_date_string.trim().match(/(?:^|[^\n]+)(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/ ) ) ) {
            return '';
        }
        return ( RegExp.$1 + '/' + RegExp.$2 + '/' + RegExp.$3 );
    }, // end of get_formatted_date_string()
    
    
    get_child_text_from_jq_element : function ( jq_element ) {
        var child_text_list = [];
        
        jq_element.contents().each( function() {
            if ( this.nodeType == 3 ) {
                child_text_list.push( this.nodeValue.trim().replace( /\s+/g, ' ' ) );
            }
        } );
        
        return child_text_list.join( ' ' ).trim();
    }, // end of get_child_text_from_jq_element()
    
    
    get_price_number : function ( price_string ) {
        if ( ! price_string ) {
            return '';
        }
        
        var price_number_string = price_string.replace( /[^\d.\-]/g, '' ),
            price = parseInt( price_number_string, 10 );
        
        if ( isNaN( price ) ) {
            return '';
        }
        
        return price;
    }, // end of get_price_number()
    
    
    create_csv_download_button : function () {
        var self = this,
            jq_csv_download_button = self.jq_csv_download_button = $( '<button class="noprint"/>' );
        
        jq_csv_download_button
            .attr( 'id', SCRIPT_NAME + '-csv-download-button' )
            .text( OPTIONS.CSV_DOWNLOAD_BUTTON_TEXT )
            .css( {
                'position' : 'fixed',
                'top' : '8px',
                'right' : '16px',
                'cursor' : 'pointer'
            } )
            .click( function ( event ) {
                self.onclick_csv_download_button( event );
            } )
            .prependTo( self.jq_body );
        
        return self;
    }, // end of create_csv_download_button()
    
    
    download_csv : function () {
        var self = this;
        
        if ( ! self.jq_csv_download_link ) {
            self.create_csv();
        }
        
        self.jq_csv_download_link[ 0 ].click();
        
        return self;
    }, // end of download_csv()
    
    
    create_csv : function () {
        var self = this,
            open_parameters = self.open_parameters,
            url_to_page_info = self.url_to_page_info,
            csv_lines = [],
            order_url_list = [ open_parameters.first_order_url ].concat( open_parameters.additional_order_urls );
        
        csv_lines.push( self.create_csv_line( self.csv_header_columns ) );
        
        if ( open_parameters.is_digital ) {
            order_url_list.forEach( function ( order_url ) {
                var order_parameters = url_to_page_info[ order_url ].order_parameters;
                
                order_parameters.item_list.forEach( function ( item, item_index ) {
                    csv_lines.push( self.create_csv_line( [
                        order_parameters.order_date, // 注文日
                        order_parameters.order_id, // 注文番号
                        item.name, // 商品名
                        item.remarks, // 付帯情報
                        item.price, // 価格
                        item.number, // 個数
                        ( item_index == 0 ) ? order_parameters.order_subtotal_price : '', // 商品小計
                        ( item_index == 0 ) ? order_parameters.order_total_price : '', // 注文合計(送料・手数料含む)
                        order_parameters.order_status, // 状態
                        ( item_index == 0 ) ? order_parameters.order_billing_amount : '', // 請求額
                        ( item_index == 0 ) ? order_parameters.card_info.card_billing_date : '', // クレカ請求日
                        ( item_index == 0 ) ? order_parameters.card_info.card_billing_amount : '', // クレカ請求額
                        ( item_index == 0 ) ? order_parameters.card_info.card_type : '', // クレカ種類
                        order_parameters.order_url, // 注文概要URL
                        order_parameters.receipt_url, // 領収書URL
                        item.url // 商品URL
                    ] ) );
                } );
            } );
        }
        else {
            order_url_list.forEach( function ( order_url ) {
                var order_parameters = url_to_page_info[ order_url ].order_parameters;
                
                order_parameters.item_group_list.forEach( function ( item_group ) {
                    item_group.item_list.forEach( function ( item, item_index ) {
                        csv_lines.push( self.create_csv_line( [
                            order_parameters.order_date, // 注文日
                            order_parameters.order_id, // 注文番号
                            item.name, // 商品名
                            item.remarks, // 付帯情報
                            item.price, // 価格
                            item.number, // 個数
                            ( item_index == 0 ) ? item_group.subtotal_price : '', // 商品小計
                            ( item_index == 0 ) ? item_group.total_price : '', // 注文合計(送料・手数料含む)
                            item_group.status, // 状態
                            ( item_index == 0 ) ? item_group.billing_amount : '', // 請求額
                            ( item_index == 0 ) ? item_group.card_info.card_billing_date : '', // クレカ請求日
                            ( item_index == 0 ) ? item_group.card_info.card_billing_amount : '', // クレカ請求額
                            ( item_index == 0 ) ? item_group.card_info.card_type : '', // クレカ種類
                            order_parameters.order_url, // 注文概要URL
                            order_parameters.receipt_url, // 領収書URL
                            item.url // 商品URL
                        ] ) );
                    } );
                } );
            } );
        }
        
        var csv = csv_lines.join( '\r\n' ),
            bom = new Uint8Array( [ 0xEF, 0xBB, 0xBF ] ),
            blob = new Blob( [ bom, csv ], { 'type' : 'text/csv' } ),
            blob_url = URL.createObjectURL( blob ),
            filename = 'amazon-order_' + ( ( open_parameters.is_digital ) ? '' : 'non-' ) + 'digital_' + open_parameters.target_year + ( ( 0 < open_parameters.target_month ) ? '-' + open_parameters.target_month : '' ) + '.csv',
            jq_csv_download_link = self.jq_csv_download_link = $( '<a/>' );
            
        jq_csv_download_link
            .attr( {
                'download' : filename,
                'href' : blob_url
            } )
            .addClass( 'noprint' )
            .css( {
                'display' : 'inline-block',
                'width' : '0',
                'height' : '0',
                'visibility' : 'hidden',
                'position' : 'absolute',
                'top' : '0',
                'left' : '0',
                'pointerEvents' : 'none'
            } )
            .prependTo( self.jq_body );
        
        return self;
    }, // end of create_csv()
    
    
    create_csv_line : function ( source_csv_columns ) {
        var output_csv_columns = [];
        
        source_csv_columns.forEach( function ( source_csv_column ) {
            source_csv_column = ( '' + source_csv_column ).trim();
            
            if ( /^\d+$/.test( source_csv_column ) ) {
                output_csv_columns.push( source_csv_column );
            }
            else {
                output_csv_columns.push( '"' + source_csv_column.replace( /"/g, '""' ) + '"' );
            }
        } );
        
        return output_csv_columns.join( ',' );
    }

}; // end of TemplateReceiptOutputPage

// }


// ■ ページ初期化処理 {
function is_order_history_page() {
    return /^https?:\/\/[^\/]+\/gp\/your-account\/order-history/.test( window.location.href );
} // end of is_order_history_page()


function is_receipt_page() {
    return /^https?:\/\/[^\/]+\/gp\/(?:digital\/your-account\/order-summary\.html|css\/summary\/print\.html)/.test( window.location.href );
} // end of is_receipt_page()


function is_signin_page() {
    return /^https?:\/\/[^\/]+\/ap\/signin/.test( window.location.href );
} // end of is_signin_page()


function init_order_history_page() {
    if ( ! is_order_history_page() ) {
        return;
    }
    
    object_extender( TemplateOrderHistoryFilter ).init();
    
} // end of init_order_history_page()


function init_first_order_page( open_parameters ) {
    if ( ! is_receipt_page() ) {
        return;
    }
    
    object_extender( TemplateReceiptOutputPage ).init( open_parameters );

} // end of init_first_order_page()


function init_additional_order_page( open_parameters ) {
    if ( is_signin_page() ) {
        window.parent.postMessage( {
            request_order_url : open_parameters.request_order_url,
            html : '<html><head><title>Please Sign-in</title></head><body><h3 style="color:red; font-weight:bolder;">Please Sign-in !!</h3></body></html>',
            error : true,
            error_message : 'sign-in requested',
            signin_request : true
        }, get_origin_url() );
        return;
    }
    
    if ( ! is_receipt_page() ) {
        window.parent.postMessage( {
            request_order_url : open_parameters.request_order_url,
            html : '<html><head><title>Unknown Error</title></head><body><h3 style="color:red; font-weight:bolder;">Unknow Errror !!</h3></body></html>',
            error : true,
            error_message : 'unknown error'
        }, get_origin_url() );
        return;
    }
    
    wait_for_rendering( function ( result ) {
        window.parent.postMessage( {
            request_order_url : open_parameters.request_order_url,
            html : result.html
        }, get_origin_url() ); // ※第二引数は targetOrigin（window.parentの生成元）→同一ドメインのため、簡略化
    } );
} // end of init_additional_order_page()


function initialize( user_options ) {
    if ( user_options ) {
        Object.keys( user_options ).forEach( function ( name ) {
            if ( user_options[ name ] === null ) {
                return;
            }
            OPTIONS[ name ] = user_options[ name ];
        } );
    }
    
    if ( ! OPTIONS.OPERATION ) {
        return;
    }
    
    var open_parameters = ( function () {
            var open_parameters = {};
            
            try {
                open_parameters = JSON.parse( window.name );
                // TODO: MS-Edge 版 Tampermonkey だと、子 の window.name が undefined となってしまう
                
                if ( ! open_parameters ) {
                    return {};
                }
                
                if ( ( open_parameters.child_window_id === undefined ) || ( open_parameters.child_window_id.indexOf( SCRIPT_NAME + '-' ) != 0 ) ) {
                    return {};
                }
            }
            catch ( error ) {
                return {};
            }
            
            return open_parameters;
        } )();
    
    log_debug( 'open_parameters:', open_parameters );
    
    if ( open_parameters.child_window_id ) {
        if ( typeof open_parameters.additional_order_urls != 'undefined' ) {
            init_first_order_page( open_parameters );
        }
        else {
            init_additional_order_page( open_parameters );
        }
    }
    else {
        init_order_history_page();
    }

} // end of initialize()

// }


// ■ エントリポイント {
if ( typeof WEB_EXTENSION_INIT == 'function' ) {
    // 拡張機能から実行した場合、ユーザーオプションを読み込む
    WEB_EXTENSION_INIT( function ( user_options ) {
        initialize( user_options );
    } );
}
else {
    initialize();
}

// }


} )();

// ■ end of file
