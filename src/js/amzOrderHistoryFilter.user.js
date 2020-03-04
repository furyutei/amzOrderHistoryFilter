// ==UserScript==
// @name            amzOrderHistoryFilter
// @namespace       http://furyu.hatenablog.com/
// @author          furyu
// @version         0.1.0.18
// @include         https://www.amazon.co.jp/gp/your-account/order-history*
// @include         https://www.amazon.co.jp/gp/css/order-history*
// @include         https://www.amazon.co.jp/gp/digital/your-account/order-summary.html*
// @include         https://www.amazon.co.jp/gp/css/summary/print.html*
// @include         https://www.amazon.co.jp/ap/signin*
// @require         https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
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
    ADDRESSEE_CHANGEABLE : true, // true: 宛名を設定・変更可
    ENABLE_PRINT_PREVIEW_BUTTON : true, // true: 印刷プレビューボタンを表示(Firefox用)
    
    DEFAULT_FILTER_INCLUDE_DIGITAL : true, // フィルタ対象(デジタルコンテンツ)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_NONDIGITAL : false, // フィルタ対象(デジタルコンテンツ以外)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_RESERVATION : true, // フィルタ対象(予約)のデフォルト値(true: 有効)
    
    OPERATION : true // true: 動作中、false: 停止中
};

// }


// ■ 共通変数 {
var SCRIPT_NAME = 'amzOrderHistoryFilter',
    DEBUG = false;

if ( typeof jQuery != 'function' ) {
    console.error( SCRIPT_NAME + ':', 'Library not found - ', 'jQuery:', typeof jQuery );
    return;
}

var $ = jQuery,
    IS_WEB_EXTENSION = !! ( window.is_web_extension ),
    IS_FIREFOX = ( 0 <= navigator.userAgent.toLowerCase().indexOf( 'firefox' ) ),
    IS_EDGE = ( 0 <= navigator.userAgent.toLowerCase().indexOf( 'edge' ) ),
    WEB_EXTENSION_INIT = window.web_extension_init,
    ORDER_HISTORY_FILTER = null,
    DEFAULT_OPTIONS = {},
    IS_TOUCHED = ( function () {
        var touched_id = SCRIPT_NAME + '_touched',
            jq_touched = $( '#' + touched_id );
        
        if ( 0 < jq_touched.length ) {
            return true;
        }
        
        $( '<b>' ).attr( 'id', touched_id ).css( 'display', 'none' ).appendTo( $( document.documentElement ) );
        
        return false;
    } )();

if ( IS_TOUCHED ) {
    console.error( SCRIPT_NAME + ': Already loaded.' );
    return;
}

OPTIONS.SELECT_MONTH_LABEL_TEXT = '対象月選択';
OPTIONS.SELECT_MONTH_NO_SELECT_TEXT = '未選択';
OPTIONS.SELECT_MONTH_ALL_TEXT = '全て';
OPTIONS.CHECKBOX_FILTER_INCLUDE_DIGITAL_TEXT = 'デジタル';
OPTIONS.CHECKBOX_FILTER_INCLUDE_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.CHECKBOX_FILTER_INCLUDE_RESERVATION_TEXT = '予約分を含む';
OPTIONS.COUNTER_LABEL_DIGITAL_TEXT = 'デジタル';
OPTIONS.COUNTER_LABEL_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.SELECT_DESTINATION_LABEL_TEXT = 'お届け先';
OPTIONS.SELECT_DESTINATION_ALL_TEXT = '全て';
OPTIONS.SELECT_DESTINATION_NON_TEXT = '宛先無し'; // TODO: 宛先無しのときに適切なキーがわからないため保留（住所の氏名欄は割と何でも受け付けてしまうため、被らないのが思いつかない）
OPTIONS.PRINT_RECEIPT_BUTTON_TEXT = '領収書印刷用画面';
OPTIONS.LOGIN_REQUIRED_MESSAGE = 'サーバー側よりログインが要求されましたので、取得を中止します。';
OPTIONS.RECEIPT_READ_TIMEOUT_MESSAGE = '応答がないままタイムアウトしました。領収書の取得を最初からやり直します。';
OPTIONS.CSV_DOWNLOAD_BUTTON_TEXT = '注文履歴CSV(参考用)ダウンロード';
OPTIONS.REFUND_CSV_DOWNLOAD_BUTTON_TEXT = '返金情報CSV(参考用)ダウンロード';
OPTIONS.CHANGE_ADDRESSEE_BUTTON_TEXT = '宛名変更';
OPTIONS.CHANGE_ADDRESSEE_PROMPT_MESSAGE = '宛名を指定してください';
OPTIONS.PRINT_PREVIEW_BUTTON_TEXT = '印刷プレビュー';
OPTIONS.TEXT_FILTER_LABEL_TEXT = '絞り込み';
OPTIONS.TEXT_FILTER_PLACEHOLDER_TEXT = 'キーワード、または、注文番号を入力';
OPTIONS.TEXT_FILTER_KEYWORDS_RULED_OUT_CHECKBOX_LABEL_TEXT = '除外';
OPTIONS.TEXT_FILTER_APPLY_BUTTUON_TEXT = '適用';
OPTIONS.TEXT_FILTER_CLEAR_BUTTUON_TEXT = 'クリア';

// }


// ■ 関数 {
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


function log_info() {
    var arg_list = [ '[' + SCRIPT_NAME + ']', '(' + ( new Date().toISOString() ) + ')' ];
    
    console.info.apply( console, arg_list.concat( to_array( arguments ) ) );
} // end of log_error()


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


function zen_to_han( source_string ) {
    return source_string
        .replace( /[Ａ-Ｚａ-ｚ０-９]/g, function( match_string ) {
            return String.fromCharCode( match_string.charCodeAt( 0 ) - 0xFEE0 );
        } )
        .replace( /[\u3000]/g, ' ' );
} // end of zen_to_han()


function get_safefilename( source_filename ) {
    return source_filename.replace( /[\\\/:*?"<>|;]/g, '_' );
} // end of get_safefilename()


var object_extender = ( function () {
    // 参考: [newを封印して、JavaScriptでオブジェクト指向する(1): Architect Note](http://blog.tojiru.net/article/199670885.html?seesaa_related=related_article)
    function object_extender( base_object ) {
        var template = object_extender.template,
            mixin_object_list = Array.prototype.slice.call( arguments, 1 ),
            expanded_object;
        
        template.prototype = base_object;
        
        expanded_object = new template();
        
        mixin_object_list.forEach( function ( object ) {
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
        return new URL( path, base_url ).href;
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


var get_formatted_date_string = ( function () {
    var reg_date = /(?:^|[^\d]+)(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/;
    
    return function ( source_date_string ) {
        if ( ( ! source_date_string ) || ( ! source_date_string.trim().match( reg_date ) ) ) {
            return '';
        }
        return ( RegExp.$1 + '/' + RegExp.$2 + '/' + RegExp.$3 );
    };
} )(); // end of get_formatted_date_string()


function get_child_text_from_jq_element( jq_element ) {
    var child_text_list = [];
    
    jq_element.contents().each( function () {
        if ( this.nodeType == 3 ) {
            child_text_list.push( this.nodeValue.replace( /[\s\u00a0\ufffd]+/g, ' ' ).trim() );
        }
    } );
    
    return child_text_list.join( ' ' ).trim();
} // end of get_child_text_from_jq_element()


function get_price_number( price_string ) {
    if ( ! price_string ) {
        return '';
    }
    
    var price_number_string = price_string.replace( /[^\d.\-]/g, '' ),
        price = parseInt( price_number_string, 10 );
    
    if ( isNaN( price ) ) {
        return '';
    }
    
    return price;
} // end of get_price_number()


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
            log_error( 'wait_for_rendering(): timeover', location.href, options );
            
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
    //loading_icon_url : 'https://images-na.ssl-images-amazon.com/images/G/01/payments-portal/r1/loading-4x._CB338200758_.gif',
    loading_icon_svg : '<svg version="1.1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="10" stroke-width="4" style="stroke: currentColor; opacity: 0.4;"></circle><path d="M 12,2 a 10 10 -90 0 1 9,5" fill="none" stroke="currentColor" stroke-width="4" />',
    
    init : function ( options ) {
        if ( ! options ) {
            options = {};
        }
        
        var self = this,
            jq_loading = $( '<div/>' ).addClass( SCRIPT_NAME + '-loading' ).css( {
                /*
                //'width' : '100%',
                //'height' : '100%',
                //'background' : 'url(' + self.loading_icon_url + ') center center no-repeat'
                */
                'position' : 'absolute',
                'top' : '0',
                'right' : '0',
                'bottom' : '0',
                'left' : '0',
                'margin' : 'auto',
                'width' : '100px',
                'height' : '100px',
                'color' : '#F3A847',
            } ).html( self.loading_icon_svg ),
            
            jq_loading_dialog = self.jq_loading_dialog = $( '<div/>' ).addClass( SCRIPT_NAME + '-mask' ).css( {
                'display' : 'none',
                'position' : 'fixed',
                'top' : '0',
                'left' : '0',
                'z-index' : '10000',
                'width' : '100%',
                'height' : '100%',
                'background' : 'black',
                'opacity' : '0.5',
            } ).append( jq_loading );
        
        $( '<style type="text/css"/>' )
            .text( [
                '.' + SCRIPT_NAME + '-loading svg {animation: now_loading 1.5s linear infinite;}',
                '@keyframes now_loading {0% {transform: rotate(0deg);} 100% {transform: rotate(360deg);}}',
            ].join( '\n' ) )
            .appendTo( $( 'head' ) );
        
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
        '    <label><span class="month-label label left"></span><select name="month"></select></label>',
        '    <label><input name="include-digital" type="checkbox" /><span class="include-digital-label label"></span></label>',
        '    <label><input name="include-nondigital" type="checkbox" /><span class="include-nondigital-label label"></span></label>',
        '    <label>(<input name="include-reservation" type="checkbox" /><span class="include-reservation-label label"></span>)</label>',
        '    <br />',
        '    <label><span class="destination-label label left"></span><select name="destination"></select></label>',
        '    <br />',
        '    <label><span class="text-filter-label label left"></span><form>',
        '       <input name="text-filter-keywords" type="text" />',
        '       <label><input name="text-filter-keywords-ruled-out" type="checkbox" /><span class="text-filter-keywords-ruled-out-label label"></span></label>',
        '       <button name="text-filter-apply" /><button name="text-filter-clear" />',
        '    </form><label>',
        '  </div>',
        '  <div class="operation-container">',
        '    <div class="counter-container">',
        '      <div class="counter digital"><span class="label"></span>:<span class="number">-</span></div>',
        '      <div class="counter nondigital"><span class="label"></span>:<span class="number">-</span></div>',
        '    </div>',
        '    <button name="print-receipt"></button>',
        '    <br />',
        '    <div class="message"></div>',
        '  </div>',
        '</div>'
    ].join( '\n' ),
    
    
    filter_option_keys : {
        include_digital : SCRIPT_NAME + '_include_digital',
        include_nondigital : SCRIPT_NAME + '_include_nondigital',
        include_reservation : SCRIPT_NAME + '_include_reservation',
    },
    
    
    init : function ( under_suspension ) {
        var self = this;
        
        self.under_suspension = !! under_suspension;
        
        var target_period = $( 'select#orderFilter' ).val();
        
        try {
            if ( target_period.match( /^year-(\d{4})$/ ) ) {
                target_period = RegExp.$1;
            }
            else {
                switch ( target_period ) {
                    case 'last30' :
                        target_period = 'last-30days';
                        break;
                    
                    case 'months-6' :
                        target_period = 'last-6months';
                        break;
                    
                    default :
                        return self;
                }
            }
        }
        catch ( error ) {
            log_error( error );
            return self;
        }
        
        self.target_period = target_period;
        
        var target_month = self.target_month = -1,
            order_information = self.order_information = {
                is_ready : false,
                month_order_info_lists : {},
                destination_infos : {},
                current_order_info_list : []
            },
            loading_dialog = self.loading_dialog = object_extender( TemplateLoadingDialog ).init();
        
        self.init_filter_options().init_filter_control();
        
        return self;
    }, // end of init()
    
    
    is_under_suspension : function () {
        var self = this;
        
        return self.under_suspension;
    }, // end of is_under_suspension()
    
    
    activate : function () {
        var self = this;
        
        if ( ! self.under_suspension ) {
            return self;
        }
        
        self.under_suspension = false;
        
        if ( self.jq_filter_control ) {
            self.jq_filter_control.show();
        }
        
        return self;
    }, // end of activate()
    
    
    suspend : function () {
        var self = this;
        
        if ( self.under_suspension ) {
            return self;
        }
        
        if ( self.order_information.is_ready ) {
            // 動作停止要求があったときに既に準備完了（ページ内容改変）済み→リロードを行う
            window.location.reload( false );
            return self;
        }
        
        self.under_suspension = true;
        
        if ( self.jq_filter_control ) {
            self.jq_filter_control.hide();
        }
        
        return self;
    }, // end of suspend()
    
    
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
            
            jq_filter_control = self.jq_filter_control = $( self.filter_control_template ).attr( 'id', SCRIPT_NAME + '-filter-control' ).css( {
                'position' : 'relative',
                'margin' : '0 0 4px 0',
                'min-height' : '80px'
            } ),
            
            jq_parameter_container = jq_filter_control.find( '.parameter-container' ).css( {
                'position' : 'absolute',
                'top' : '0',
                'left' : '0',
                'z-index' : 1
            } ),
            
            jq_select_month = self.jq_select_month = jq_parameter_container.find( 'select[name="month"]' ).css( {
                'background' : '#fff0f5'
            } ),
            jq_select_month_option_no_select = self.jq_select_month_option_no_select = $( '<option />' ).val( -1 ).text( OPTIONS.SELECT_MONTH_NO_SELECT_TEXT ).appendTo( jq_select_month ).css( {
                'background' : '#fff0f5'
            } ),
            jq_select_month_option_all = self.jq_select_month_option_all = $( '<option />' ).val( 0 ).text( OPTIONS.SELECT_MONTH_ALL_TEXT ).appendTo( jq_select_month ).css( {
                'background' : 'white'
            } ),
            jq_select_month_option,
            
            jq_checkbox_include_digital = self.jq_checkbox_include_digital = jq_parameter_container.find( 'input[name="include-digital"]' ),
            jq_checkbox_include_nondigital = self.jq_checkbox_include_nondigital = jq_parameter_container.find( 'input[name="include-nondigital"]' ),
            jq_checkbox_include_reservation = self.jq_checkbox_include_reservation = jq_parameter_container.find( 'input[name="include-reservation"]' ),
            
            jq_select_destination = self.jq_select_destination = jq_parameter_container.find( 'select[name="destination"]' )
                .prop( 'disabled', 'disabled' )
                .css( {
                    'opacity' : '0.5'
                } ),
            jq_select_destination_option_all = $( '<option />' ).val( '' ).text( OPTIONS.SELECT_DESTINATION_ALL_TEXT ).appendTo( jq_select_destination ),
            jq_select_destination_option,
            
            jq_input_text_filter = self.jq_input_text_filter = jq_parameter_container.find( 'input[name="text-filter-keywords"]' )
                .attr( 'placeholder', OPTIONS.TEXT_FILTER_PLACEHOLDER_TEXT )
                .prop( 'disabled', 'disabled' )
                .css( {
                    'min-width' : '500px',
                    'height' : '24px',
                    'margin-right' : '8px',
                    'opacity' : '0.5'
                } ),
            jq_checkbox_text_filter_keywords_ruled_out = self.jq_checkbox_text_filter_keywords_ruled_out = jq_parameter_container.find( 'input[name="text-filter-keywords-ruled-out"]' ),
            jq_button_text_filter_apply = self.jq_button_text_filter_apply = jq_parameter_container.find( 'button[name="text-filter-apply"]' )
                .text( OPTIONS.TEXT_FILTER_APPLY_BUTTUON_TEXT )
                .prop( 'disabled', 'disabled' )
                .css( {
                    'cursor' : 'pointer',
                    'margin-right' : '8px'
                } ),
            jq_button_text_filter_clear = self.jq_button_text_filter_clear = jq_parameter_container.find( 'button[name="text-filter-clear"]' )
                .text( OPTIONS.TEXT_FILTER_CLEAR_BUTTUON_TEXT )
                .prop( 'disabled', 'disabled' )
                .css( {
                    'cursor' : 'pointer',
                    'margin-right' : '8px'
                } ),
            
            jq_counter_container = self.jq_counter_container = jq_filter_control.find( '.counter-container' ).css( {
                'color' : 'lightgray',
                'vertical-align' : 'top'
            } ),
            jq_counter_digital = jq_counter_container.find( '.counter.digital' ),
            jq_counter_nondigital = jq_counter_container.find( '.counter.nondigital' ),
            jq_counter_digital_number = self.jq_counter_digital_number = jq_counter_digital.find( '.number' ),
            jq_counter_nondigital_number = self.jq_counter_nondigital_number = jq_counter_nondigital.find( '.number' ),
            
            jq_operation_continer = jq_filter_control.find( '.operation-container' ).css( {
                'position' : 'absolute',
                'top' : '0',
                'right' : '0',
                'text-align' : 'right'
            } ),
            jq_button_print_receipt = self.jq_button_print_receipt = jq_operation_continer.find( 'button[name="print-receipt"]' )
                .text( OPTIONS.PRINT_RECEIPT_BUTTON_TEXT )
                .prop( 'disabled', 'disabled' ),
            
            jq_message = self.jq_message = jq_filter_control.find( '.message' ).css( {
                'color' : 'red',
                'min-width' : '50px',
                'padding' : '4px',
                'font-weight' : 'bolder',
                'text-align' : 'right'
            } ),
            
            current_date = new Date(),
            target_period = self.target_period,
            current_year_number = current_date.getFullYear(),
            current_month_number = ( ( target_period == current_year_number ) || isNaN( target_period ) ) ? ( 1 + current_date.getMonth() ) : 0,
            jq_select_month_option_this_year = $();
            
        
        jq_filter_control.find( 'label' ).css( {
            'display' : 'inline-block',
            'margin' : '0 4px'
        } );
        
        jq_filter_control.find( 'div,form' ).css( {
            'display' : 'inline-block'
        } );
        
        jq_filter_control.find( 'div.counter' ).css( {
            'font-weight' : 'bolder'
        } );
        
        jq_filter_control.find( 'span.label' ).css( {
            'margin' : '0 0 0 4px'
        } );
        
        jq_filter_control.find( 'span.label.left' ).css( {
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
        jq_parameter_container.find( '.destination-label' ).text( OPTIONS.SELECT_DESTINATION_LABEL_TEXT );
        jq_parameter_container.find( '.text-filter-label' ).text( OPTIONS.TEXT_FILTER_LABEL_TEXT );
        jq_parameter_container.find( '.text-filter-keywords-ruled-out-label' ).text( OPTIONS.TEXT_FILTER_KEYWORDS_RULED_OUT_CHECKBOX_LABEL_TEXT );
        
        jq_counter_digital.find( '.label' ).text( OPTIONS.COUNTER_LABEL_DIGITAL_TEXT );
        jq_counter_nondigital.find( '.label' ).text( OPTIONS.COUNTER_LABEL_NONDIGITAL_TEXT );
        
        for ( month_number = 12; 1 <= month_number ; month_number -- ) {
            jq_select_month_option = $( '<option />' ).val( month_number ).text( month_number ).css( 'background', 'white' ).appendTo( jq_select_month );
            
            if ( ! current_month_number ) {
                continue;
            }
            
            if ( target_period == current_year_number ) {
                if ( current_month_number < month_number ) {
                    jq_select_month_option.prop( 'disabled', true ).css( 'background', '#cccccc' );
                }
            }
            else {
                if ( month_number <= current_month_number ) {
                    jq_select_month_option_this_year = jq_select_month_option_this_year.add( jq_select_month_option );
                }
            }
        }
        
        if ( 0 < jq_select_month_option_this_year.length ) {
            jq_select_month_option_all.after( jq_select_month_option_this_year );
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
        
        jq_select_destination.val( '' );
        
        if ( IS_EDGE ) {
            // MS-Edge では、なぜか jQuery の change イベントが発火しない
            jq_select_destination[ 0 ].addEventListener( 'change', function ( event ) {
                self.onchange_destination( event );
            } );
        }
        else {
            jq_select_destination.change( function ( event ) {
                self.onchange_destination( event );
            } );
        }
        
        jq_checkbox_text_filter_keywords_ruled_out
            .prop( 'checked', false )
            .prop( 'disabled', 'disabled' )
            .change( function ( event ) {
                self.onchange_text_filter_keywords_ruled_out( event );
            } )
            .parent( 'label' )
            .css( 'opacity', '0.5' );
        
        jq_button_text_filter_apply
            .click( function ( event ) {
                self.onclick_text_filter_apply_button( event );
            } )
            .parent( 'form' )
            .on( 'submit', function( event ) {
                self.onclick_text_filter_apply_button( event );
            } );
        
        jq_button_text_filter_clear
            .click( function ( event ) {
                self.onclick_text_filter_clear_button( event );
            } );
        
        jq_button_print_receipt
            .click( function ( event ) {
                self.onclick_button_print_receipt( event );
            } );
        
        if ( self.under_suspension ) {
            jq_filter_control.hide();
        }
        
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
    
    
    onchange_destination : function ( event ) {
        var self = this,
            jq_select_destination = self.jq_select_destination;
        
        event.stopPropagation();
        event.preventDefault();
        
        jq_select_destination.blur();
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_destination()
    
    
    onchange_text_filter_keywords_ruled_out : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.update_order_container();
        
        return self;
    }, // end of onchange_text_filter_keywords_ruled_out()
    
    
    onclick_text_filter_apply_button  : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.update_order_container();
        
        return self;
    }, // end of onclick_text_filter_apply_button()
    
    
    onclick_text_filter_clear_button  : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.jq_checkbox_text_filter_keywords_ruled_out.prop( 'checked', false );
        self.jq_input_text_filter.val( '' );
        
        self.update_order_container();
        
        return self;
    }, // end of onclick_text_filter_clear_button()
    
    
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
            jq_select_destination = self.jq_select_destination,
            target_month = self.target_month = parseInt( jq_select_month.val(), 10 ),
            target_destination = self.target_destination = jq_select_destination.val(),
            text_filter_info = self.text_filter_info = self.get_text_filter_info(),
            target_keyword_string = self.target_keyword_string = text_filter_info.keyword_string,
            target_keyword_is_ruled_out = self.target_keyword_is_ruled_out = self.jq_checkbox_text_filter_keywords_ruled_out.is( ':checked' ),
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
            
            if ( target_destination ) {
                if ( ! order_info.recipient_map[ target_destination ] ) {
                    return;
                }
            }
            
            var is_hit = self.check_text_filter_is_hit( order_info.search_index_text, text_filter_info );
            
            if ( ( target_keyword_is_ruled_out && is_hit ) || ( ( ! target_keyword_is_ruled_out ) && ( ! is_hit ) ) ) {
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
            last_page_url = $( 'div.pagination-full ul.a-pagination li.a-normal:last a' ).attr( 'href' ),
            error_button = $( '<button/>' ).css( {
                'margin-left' : '4px',
                'color' : 'red'
            } ),
            download_text = function ( filename, text ) {
                var blob = new Blob( [ text ], { type : 'text/plain' } ),
                    $link = $( '<a>' ).attr( {
                        'download' : filename,
                        'href' : URL.createObjectURL( blob )
                    } ).css( {
                        'display' : 'inline-block',
                        'width' : '0',
                        'height' : '0',
                        'visibility' : 'hidden'
                    } ).appendTo( 'body' );
                
                $link[ 0 ].click();
                
                $link.remove();
            };
        
        if ( ! last_page_url ) {
            //last_page_url = window.location.href;
            // Error logged with the Track&Report JS errors API(http://tiny/1covqr6l8/wamazindeClieUserJava): {"m":"[CSM] Ajax request to same page detected xmlhttprequest : ～
            last_page_url = window.location.href.replace( /&_aohtimestamp=\d+/g, '' ) + '&_aohtimestamp=' + new Date().getTime() ;
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
            
            if ( 0 < result.fetch_failure_list.length ) {
                var failure_urls_text = result.fetch_failure_list.map( function ( fetch_failure_result ) {
                        return get_absolute_url( fetch_failure_result.url );
                    } ).join( '\n' );
                
                error_button.text( 'Download failure list' ).click( function ( event ) {
                    download_text( 'download-error-urls.txt', failure_urls_text );
                } );
                self.jq_message.text( 'Partial download failure' ).append( error_button );
            }
            
            self.analyze_order_information( result.fetch_result_list );
            
            if ( ( result.fetch_failure_list.length <= 0 ) && ( 0 < order_information.order_error_urls.length ) ) {
                var error_urls_text = order_information.order_error_urls.join( '\n' );
                
                error_button.text( 'Download error list' ).click( function ( event ) {
                    download_text( 'order-error-urls.txt', error_urls_text );
                } );
                self.jq_message.text( 'Partial order error' ).append( error_button );
            }
            
            var destination_infos = order_information.destination_infos,
                destination_info_list = [],
                month_number = 0,
                month_order_info_lists = order_information.month_order_info_lists,
                jq_select_month = self.jq_select_month,
                jq_select_month_option;
            
            Object.keys( order_information.destination_infos ).forEach( function ( name ) {
                destination_info_list.push( order_information.destination_infos[ name ] );
            } );
            
            destination_info_list.sort( function ( a, b ) {
                return ( a.order_info_list.length < b.order_info_list.length );
            } );
            
            destination_info_list.forEach( function ( destination_info ) {
                $( '<option />' ).val( destination_info.name ).text( destination_info.name ).appendTo( self.jq_select_destination );
            } );
            
            for ( month_number = 1; month_number <= 12; month_number ++ ) {
                jq_select_month_option = jq_select_month.children( 'option[value=' + month_number + ']' );
                
                if ( month_order_info_lists[ month_number ].length <= 0 ) {
                    //jq_select_month_option.remove();
                    if ( jq_select_month_option.is( ':selected' ) ) {
                        jq_select_month.val( 0 );
                    }
                    jq_select_month_option.prop( 'disabled', true ).css( 'background', '#cccccc' );
                }
                else {
                    jq_select_month_option.css( 'background', 'white' );
                }
            }
            
            order_information.is_ready = true;
            
            self.jq_select_month.css( 'background', 'transparent' );
            self.jq_select_month_option_no_select.prop( 'disabled', true ).css( 'background', '#cccccc' );
            self.jq_select_destination.css( 'opacity', '1' ).prop( 'disabled', false );
            self.jq_input_text_filter.css( 'opacity', '1' ).prop( 'disabled', false );
            self.jq_checkbox_text_filter_keywords_ruled_out.prop( 'disabled', false ).parent( 'label' ).css( 'opacity', '1' );
            self.jq_button_text_filter_apply.prop( 'disabled', false );
            self.jq_button_text_filter_clear.prop( 'disabled', false );
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
            month_order_info_lists = order_information.month_order_info_lists = {},
            destination_infos = order_information.destination_infos = {},
            order_error_urls = order_information.order_error_urls = [];
        
        
        for ( month_number = 0; month_number <= 12; month_number ++ ) {
            month_order_info_lists[ month_number ] = [];
        }
        
        order_info_page_fetch_result_list.forEach( function ( fetch_result ) {
            var jq_html_fragment = get_jq_html_fragment( fetch_result.html ),
                jq_orders = jq_html_fragment.find( '#ordersContainer .order' );
            
            jq_orders.each( function () {
                var jq_order = $( this ),
                    individual_order_info;
                
                try {
                    individual_order_info = self.get_individual_order_info( jq_order );
                }
                catch ( error ) {
                    log_error( '*** [BUG] ***' );
                    log_info( 'jq_order.html()\n', jq_order.html() );
                    return;
                }
                
                if ( individual_order_info.order_date_info.month < 0 ) {
                    log_info( '[malformed order info]\n', individual_order_info );
                    
                    if ( individual_order_info.order_detail_url ) {
                        order_error_urls.push( get_absolute_url( individual_order_info.order_detail_url ) );
                    }
                    return;
                }
                
                month_order_info_lists[ 0 ].push( individual_order_info );
                month_order_info_lists[ individual_order_info.order_date_info.month ].push( individual_order_info );
                
                Object.keys( individual_order_info.recipient_map ).forEach( function ( order_destination ) {
                    var destination_info = destination_infos[ order_destination ];
                    
                    if ( ! destination_info ) {
                        destination_infos[ order_destination ] = destination_info = {
                            name : order_destination,
                            order_info_list : []
                        };
                    }
                    destination_info.order_info_list.push( individual_order_info );
                } );
            } );
        } );
        
        return self;
    }, // end of analyze_order_information()
    
    
    get_individual_order_info : function ( jq_order ) {
        var self = this,
            individual_order_info = {},
            jq_order_info = jq_order.children( '.order-info' ),
            jq_order_info_left = jq_order_info.find( '.a-col-left' ),
            jq_order_date = jq_order_info_left.find( '.a-span3 .value' ),
            order_date = jq_order_date.text().trim(),
            order_date_info = { year : -1, month : -1, date : -1 },
            order_year,
            order_month,
            order_day,
            order_price = jq_order_info_left.find( '.a-span2 .value' ).text().trim(),
            order_price_number = ( typeof order_price == 'string' ) ? parseInt( order_price.replace( /[^\d.\-]/g, '' ), 10 ) : 0,
            order_destination = jq_order_info_left.find( '.recipient .a-size-base a.a-popover-trigger > .trigger-text' ).text().trim(),
            jq_order_info_actions = jq_order_info.find( '.actions' ),
            order_id = jq_order_info_actions.find( '.a-size-mini .value' ).text().trim(),
            jq_order_info_actions_base = jq_order_info_actions.find( '.a-size-base' ),
            order_detail_url = jq_order_info_actions_base.find( 'a.a-link-normal:first' ).attr( 'href' ),
            order_receipt_url = jq_order_info_actions_base.find( '.hide-if-js a.a-link-normal' ).attr( 'href' ),
            jq_cancel_button = jq_order.find( 'a[role="button"]' ).filter( [
                '[href*="/your-account/order-edit.html"][href*="type=e"]',
                '[href*="/order/edit.html"][href*="useCase=cancel"]',
                '[href*="/ss/help/contact/"][href*="cancelRequest=1"]'
            ].join( ',' ) ),
            jq_order_details = jq_order.children( '.a-box:not(.order-info)' ),
            jq_order_shipment_info_container = jq_order_details.find( '.js-shipment-info-container' ).clone(),
            //jq_order_item_infos = jq_order_details.find( '.a-fixed-right-grid .a-fixed-right-grid-col.a-col-left .a-row:first .a-fixed-left-grid-col.a-col-right .a-row:not(:has(.a-button))' ).clone(),
            jq_order_item_infos = jq_order_details.find( '.a-fixed-right-grid .a-fixed-right-grid-col.a-col-left .a-row:first .a-fixed-left-grid-col.a-col-right .a-row' ).filter( function () {
                return ( $( this ).find( '.a-button' ).length <= 0 );
            } ).clone(),
            jq_gift_card_recipient_list = jq_order_item_infos.find( '.gift-card-instance .recipient' ),
            recipient_map = {},
            order_shipment_info_text = '',
            order_item_info_text = '',
            search_index_text = '';
        
        if ( ( typeof order_date == 'string' ) && ( order_date.match( /^[^\d]*(\d+)[^\d]+(\d+)[^\d]+(\d+)[^\d]*$/ ) ) ) {
            order_year = parseInt( RegExp.$1, 10 );
            order_month = parseInt( RegExp.$2, 10 );
            order_day = parseInt( RegExp.$3, 10 );
            try {
                if ( ! isNaN( new Date( '' + order_year + '-' + order_month + '-' + order_day ).getTime() ) ) {
                    order_date_info.year = order_year;
                    order_date_info.month = order_month;
                    order_date_info.day = order_day;
                    order_date_info.date = order_day;
                }
            }
            catch ( error ) {
            }
        }
        
        if ( order_date_info.month < 0 ) {
            log_error( '[malformed order date]\n', order_date, '\n', jq_order_date.html() );
            log_info( jq_order.html() );
        }
        
        if ( order_receipt_url ) {
            // /ref=oh_aui_dpi_o*_ になっていると、まれにページが読み込まれないことがある
            // → /ref=oh_aui_ajax_dpi に置換
             order_receipt_url = order_receipt_url.replace( /\/ref=oh_aui_.*?\?/, '/ref=oh_aui_ajax_dpi?' );
        }
        
        jq_order_shipment_info_container.remove( 'script, noscript, .a-declarative' );
        order_shipment_info_text = zen_to_han( jq_order_shipment_info_container.text().trim().replace( /\s+/g, ' ' ) );
        
        jq_order_item_infos.remove( 'script, noscript' );
        order_item_info_text = zen_to_han( jq_order_item_infos.text().trim().replace( /\s+/g, ' ' ) );
        
        search_index_text = ( order_id + ' ' + order_date + ' ' + order_shipment_info_text + ' ' + order_item_info_text ).toLowerCase();
        
        if ( order_destination ) {
            recipient_map[ order_destination ] = order_destination;
        }
        
        if ( order_destination ) {
            // 商品券タイプのギフト券等でお届け先が存在する場合には重複するため、jq_gift_card_recipient_list（ギフト注文のシリアル番号が入っている）からは探さない
        }
        else {
            // E メールタイプのギフト券等の送信先を取得
            jq_gift_card_recipient_list.each( function() {
                var recipient = $( this ).text().replace( /\s+/, ' ' ).trim();
                
                if ( recipient ) {
                    recipient_map[ recipient ] = recipient;
                }
            } );
        }
        
        individual_order_info = {
            order_date : order_date,
            order_date_info : order_date_info,
            order_price : order_price,
            order_price_number : order_price_number,
            order_destination : order_destination,
            order_id : order_id,
            order_detail_url : order_detail_url,
            order_receipt_url : order_receipt_url,
            is_digital : ( order_receipt_url ) ? /\/gp\/digital\//.test( order_receipt_url ) : /^D/.test( order_id ),
            is_reservation : ( ( 0 < jq_cancel_button.length ) && ( jq_order_details.length <= jq_cancel_button.length ) ),
            search_index_text : search_index_text,
            recipient_map : recipient_map,
            jq_order : jq_order
        };
        
        return individual_order_info;
    }, // end of get_individual_order_info()
    
    
    fetch_all_html : function ( url_list, callback ) {
        var self = this,
            jq_xhr_list = [];
        
        url_list.forEach( function ( url ) {
            var jq_xhr = ( function () {
                    var $deferred = $.Deferred(),
                        $promise = $deferred.promise();
                    
                    $.ajax( {
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
                    } )
                        .done( function ( html, textStatus, jqXHR ) {
                            $deferred.resolve( {
                                url : url,
                                success : true,
                                html : html,
                                textStatus : textStatus,
                                jqXHR : jqXHR
                            } );
                        } )
                        .fail( function ( jqXHR, textStatus, errorThrown ) {
                            // TODO: HTML 取得に失敗することがあるらしい(バージョン 0.1.0.12にて発生報告有り)
                            // →当該 URL について、エラー確認用出力追加＆とりあえず無視する
                            log_error( '[Fetch Failure]\n', url, '\n', jqXHR.status, jqXHR.statusText );
                            try {
                                log_info( '[Header]\n', jqXHR.getAllResponseHeaders() );
                                log_debug( jqXHR.responseText );
                            }
                            catch ( error ) {
                            }
                            
                            $deferred.resolve( {
                                url : url,
                                success : false,
                                html : '',
                                textStatus : textStatus,
                                jqXHR : jqXHR
                            } );
                        } );
                    
                    return $promise;
                } )();
            
            jq_xhr_list.push( jq_xhr );
        } );
        
        $.when.apply( $, jq_xhr_list )
            .then( function () {
                var xhr_result_list = [],
                    fetch_result_list = [],
                    fetch_failure_list = [];
                
                if ( jq_xhr_list.length == 1 ) {
                    xhr_result_list = [ arguments[ 0 ] ];
                }
                else if ( 1 < jq_xhr_list.length ) {
                    xhr_result_list = to_array( arguments );
                }
                
                xhr_result_list.forEach( function ( xhr_result, index ) {
                    if ( xhr_result.success ) {
                        fetch_result_list.push( xhr_result );
                    }
                    else {
                        fetch_failure_list.push( xhr_result );
                    }
                } );
                
                callback( {
                    success : true,
                    fetch_result_list : fetch_result_list,
                    fetch_failure_list : fetch_failure_list
                } );
            } )
            .fail( function ( error ) {
                // ※ここには入らないはず
                log_error( '*** [BUG] ***\n', error );
                
                callback( {
                    success : false,
                    error_message : 'Fetch Failure'
                } );
            } );
        
        return self;
    }, // end of fetch_all_html()
    
    
    get_text_filter_info : function () {
        var self = this,
            is_type_or = false,
            keyword_string = zen_to_han( self.jq_input_text_filter.val().replace( /\s+/, ' ' ) ).trim(),
            filter_keywords = keyword_string.split( /\s+OR\s+(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/ ),
            text_filter_info = {};
        
        if ( 1 < filter_keywords.length ) {
            is_type_or = true;
        }
        else {
            is_type_or = false;
            filter_keywords = keyword_string.split( /\s+(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/ );
        }
        
        filter_keywords  = filter_keywords
            .map( function ( filter_keyword ) {
                return filter_keyword.replace( /(?:^"|"$)/g, '' ).trim().toLowerCase();
            } )
            .filter( function ( filter_keyword ) {
                return ( filter_keyword != '' );
            } );
        
        text_filter_info = {
            keyword_string : keyword_string,
            is_type_or : is_type_or,
            filter_keywords : filter_keywords
        };
        
        return text_filter_info;
    }, // end of get_text_filter_info()
    
    
    check_text_filter_is_hit : function ( search_index_text, text_filter_info ) {
        var self = this,
            is_hit = false;
        
        if ( text_filter_info.filter_keywords.length <= 0 ) {
            return true;
        }
        
        if ( text_filter_info.is_type_or ) {
            $.each( text_filter_info.filter_keywords, function ( index, filter_keyword ) {
                if ( 0 <= search_index_text.indexOf( filter_keyword ) ) {
                    is_hit = true;
                    
                    return false;
                }
            } );
        }
        else {
            is_hit = true;
            
            $.each( text_filter_info.filter_keywords, function ( index, filter_keyword ) {
                if ( search_index_text.indexOf( filter_keyword ) < 0 ) {
                    is_hit = false;
                    
                    return false;
                }
            } );
        }
        return is_hit;
    }, // end of check_text_filter_is_hit()
    
    
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
                    is_digital : false,
                    target_period : self.target_period,
                    target_month : self.target_month,
                    target_destination : self.target_destination,
                    target_keyword_string : self.target_keyword_string,
                    target_keyword_is_ruled_out : self.target_keyword_is_ruled_out,
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
                    is_digital : true,
                    target_period : self.target_period,
                    target_month : self.target_month,
                    target_destination : self.target_destination,
                    target_keyword_string : self.target_keyword_string,
                    target_keyword_is_ruled_out : self.target_keyword_is_ruled_out,
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
    
    csv_header_columns : [ "注文日", "注文番号", "商品名", "付帯情報", "価格", "個数", "商品小計", "注文合計", "お届け先", "状態", "請求先", "請求額", "クレカ請求日", "クレカ請求額", "クレカ種類", "注文概要URL", "領収書URL", "商品URL" ],
    
    refund_csv_header_columns : [ "注文日", "注文番号", "返金日", "返金額", "返金先", "クレカ種類", "備考", "注文概要URL", "領収書URL", "返金通知書URL" ],
    
    
    init : function ( open_parameters ) {
        var self = this,
            
            remaining_request_order_urls = self.remaining_request_order_urls = [ open_parameters.first_order_url ].concat( open_parameters.additional_order_urls ),
            max_receipt_number = self.max_receipt_number = remaining_request_order_urls.length,
            
            loading_dialog = self.loading_dialog = object_extender( TemplateLoadingDialog ).init( {
                counter_required : true,
                max_number : max_receipt_number
            } ).show(),
            
            jq_body = self.jq_body = $( 'body' ),
            
            url_to_page_info = self.url_to_page_info = {},
            
            addressee = get_value( SCRIPT_NAME + '-addressee' );
        
        if ( OPTIONS.ADDRESSEE_CHANGEABLE ) {
            self.addressee = ( addressee ) ? addressee : '';
        }
        
        self.open_parameters = open_parameters;
        self.result_waiting_counter = 1 + max_receipt_number;
        self.current_receipt_number = 0;
        self.request_counter = 0;
        
        self.is_reloading = false;
        
        self.timeout_timer_id = null;
        self.reset_timeout_timer();
        
        self.jq_csv_download_link = null;
        self.jq_refund_csv_download_link = null;
        
        $( '<style type="text/css"/>' )
            .text( [
                'h2.receipt a {font-size:14px;}',
                '@media print {',
                '  .noprint { display: none; }',
                '  hr.receipt { page-break-after: always; margin: 0 0 0 0; padding: 0 0 0 0; height: 0; border: none; visibility: hidden; }',
                '}',
                'td.addressee-container {position: relative;}',
                'div.addressee {position: absolute; width: 200%; bottom: 3px; right: 16px; font-size: 14px; text-align: right;}',
                'div.addressee.digital {bottom: 6px; right: 24px; font-size: 16px;}',
            ].join( '\n' ) )
            .appendTo( $( 'head' ) );
        
        self.create_jq_header( 1, open_parameters.first_order_url ).prependTo( jq_body );
        
        $( window ).on( 'message', function ( event ) {
            self.on_receive_message( event );
        } );
        
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
            } ).text( 'No. ' + receipt_number + ' / ' + self.max_receipt_number );
        
        return jq_header;
    }, // end of create_jq_header()
    
    
    insert_jq_addressee : function ( jq_receipt_body ) {
        var self = this;
        
        if ( ! OPTIONS.ADDRESSEE_CHANGEABLE ) {
            return self;
        }
        
        //var jq_addressee_container = jq_receipt_body.find( 'table:first td[align="right"]:first:has(b:contains("様"))' );
        var jq_addressee_container = jq_receipt_body.find( 'table:first td[align="right"]:first' ).filter( function () {
            return ( 0 <= $( this ).find( 'b' ).text().indexOf( '様' ) );
        } );
        
        if ( jq_addressee_container.length <= 0 ) {
            return self;
        }
        
        var jq_addressee = $( '<div class="addressee"/>' );
        
        if ( self.open_parameters.is_digital ) {
            jq_addressee.addClass( 'digital' );
        }
        
        if ( self.addressee ) {
            jq_addressee.text( self.addressee );
        }
        
        jq_addressee_container
            .addClass( 'addressee-container' )
            .append( jq_addressee );
        
        return self;
    }, // end of create_jq_addressee()
    
    
    create_jq_receipt_body : function ( html, receipt_number, receipt_url ) {
        var self = this,
            jq_receipt_body = $( '<div/>' );
        
        jq_receipt_body
            .html( html )
            .prepend( self.create_jq_header( receipt_number, receipt_url ) )
            .prepend( self.jq_hr_template.clone() );
        
        self.insert_jq_addressee( jq_receipt_body );
        
        return jq_receipt_body;
    }, // end of create_jq_receipt_body()
    
    
    call_by_iframe : function ( request_order_url, receipt_number, existing_window ) {
        var self = this,
            child_window = open_child_window( request_order_url, {
                is_iframe : true,
                existing_window : existing_window,
                open_parameters : {
                    first_order_url : self.open_parameters.first_order_url,
                    request_order_url : request_order_url,
                    is_digital : self.open_parameters.is_digital
                }
            } );
        
        self.url_to_page_info[ request_order_url ] = {
            receipt_number : receipt_number,
            order_url : request_order_url,
            child_window : child_window
        };
        
        return self;
    }, // end of call_by_iframe()
    
    
    on_rendering_complete : function ( html ) {
        var self = this,
            open_parameters = self.open_parameters,
            jq_body = self.jq_body;
        
        log_debug( '*** on_rendering_complete: result_waiting_counter=', self.result_waiting_counter );
        
        self.reset_timeout_timer();
        
        self.result_waiting_counter --;
        
        if ( OPTIONS.REMOVE_REISSUE_STRINGS ) {
            var jq_receipt_header = jq_body.find( 'b.h1' ),
                jq_reissue_receipt_date_label = jq_body.find( 'table:first table[align="center"]:first td[valign="top"][align="left"]:first b' );
            
            jq_receipt_header.text( jq_receipt_header.text().replace( /（再発行）/, '' ) );
            jq_reissue_receipt_date_label.text( jq_reissue_receipt_date_label.text().replace( /^再/, '' ) );
        }
        
        self.insert_jq_addressee( jq_body );
        
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
        page_info.order_parameters = self.get_order_parameters( page_info.jq_receipt_body, event.data.order_detail_page_info );
        
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
    
    
    finish :  function () {
        var self = this,
            open_parameters = self.open_parameters,
            
            jq_body = self.jq_body,
            jq_toolbox = $( '<div class="toolbox noprint"/>' ).css( {
                'position' : 'fixed',
                'top' : '8px',
                'right' : '8px',
                'z-index' : '100',
                'background' : 'rgba( 255, 255, 224, 0.5 )',
                'padding' : '4px'
            } ).appendTo( jq_body ),
            
            url_to_page_info = self.url_to_page_info,
            refund_info_container_list = self.refund_info_container_list = [];
        
        if ( self.timeout_timer_id ) {
            clearTimeout( self.timeout_timer_id ) ;
            self.timeout_timer_id = null;
        }
        
        [ open_parameters.first_order_url ].concat( open_parameters.additional_order_urls ).forEach( function ( order_url, index ) {
            var page_info = url_to_page_info[ order_url ];
            
            try {
                if ( 0 < page_info.order_parameters.order_detail_page_info.refund_info.refund_list.length ) {
                    refund_info_container_list.push( {
                        refund_info : page_info.order_parameters.order_detail_page_info.refund_info,
                        page_info : page_info,
                        order_parameters : page_info.order_parameters
                    } );
                }
            }
            catch ( error ) {
            }
            
            if ( 0 < index ) {
                jq_body.append( page_info.jq_receipt_body.children() );
            }
        } );
        
        self.create_csv_download_button( jq_toolbox );
        self.create_refund_csv_download_button( jq_toolbox );
        self.create_change_addressee_button( jq_toolbox );
        self.create_print_preview_button( jq_toolbox );
        
        self.loading_dialog.hide();
        
        if ( open_parameters.show_print_dialog ) {
            if ( OPTIONS.OPEN_PRINT_DIALOG_AUTO ) {
                window.print();
            }
        }
        
        return self;
    }, // end of finish()
    
    
    get_order_parameters : function ( jq_receipt_body, order_detail_page_info ) {
        var self = this,
            order_parameters = {};
        
        if ( self.open_parameters.is_digital ) {
            order_parameters = self.get_order_parameters_digital( jq_receipt_body, order_detail_page_info.item_info_list );
        }
        else {
            order_parameters = self.get_order_parameters_nondigital( jq_receipt_body, order_detail_page_info.item_info_list );
        }
        
        order_parameters.order_detail_page_info = order_detail_page_info;
        
        log_debug( 'get_order_parameters()', order_parameters );
        
        return order_parameters;
    }, // end of get_order_parameters()
    
    
    get_order_parameters_digital : function ( jq_receipt_body, item_info_list ) {
        var self = this,
            order_parameters = {},
            order_date = '',
            order_id = '',
            item_list = [],
            other_price_info_list = [],
            order_subtotal_price = '',
            order_total_price = '',
            order_destination = '',
            order_status = '',
            order_billing_amount = '',
            order_billing_destination = '',
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
            jq_payment_summary = jq_receipt_body.children( 'table.sample' ).find( '#docs-order-summary-payment-breakdown-container' ),
            jq_payment_summary_price_infos = jq_payment_summary.find( '.pmts-summary-preview-single-item-amount' );
        
        /*
        //order_date = get_formatted_date_string( get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文日")):first' ) ) );
        //order_id = get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文番号")):first' ) );
        */
        order_date = get_formatted_date_string( get_child_text_from_jq_element(
            jq_order_summary_header.find( 'td' ).filter( function () {
                return ( 0 <= $( this ).find( 'b' ).text().indexOf( '注文日' ) );
            } ).first()
        ) );
        order_id = get_child_text_from_jq_element( 
            jq_order_summary_header.find( 'td' ).filter( function () {
                return ( 0 <= $( this ).find( 'b' ).text().indexOf( '注文番号' ) );
            } ).first()
        );
        
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
                remarks : get_child_text_from_jq_element( jq_item_info ),
                price : get_price_number( get_child_text_from_jq_element( jq_item_price ) ),
                number : 1,
                url : ( 0 < jq_item_link.length ) ? get_absolute_url( jq_item_link.attr( 'href' ) ) : ''
            } );
        } );
        
        order_subtotal_price = get_price_number( get_child_text_from_jq_element( jq_order_summary_content.find( 'tr:last td[colspan][align="right"]:contains("商品小計")' ) ) );
        order_total_price = get_price_number( get_child_text_from_jq_element( jq_order_summary_header.find( 'b:contains("注文の合計")' ) ) );
        
        if ( 0 < jq_payment_summary.length  ) {
            // 新しい(2014/04頃以降の)ものは、<!-- BEGIN ViewPaymentPlanSummary WIDGET --> というマークが入っている
            // ※ Amazonアプリストアなど、一部旧式のままのものもある模様
            
            order_billing_amount = get_price_number( get_child_text_from_jq_element( jq_payment_summary.find( '.pmts-summary-preview-single-item-total .a-color-price' ) ) );
            
            jq_payment_summary_price_infos.each( function () {
                var jq_price_info = $( this ),
                    jq_price_info_columns = jq_price_info.find( 'div.a-column' ),
                    jq_price_info_name = jq_price_info_columns.eq( 0 ),
                    jq_price_info_price = jq_price_info_columns.eq( 1 ),
                    name = jq_price_info_name.text().trim().replace( /(?:の金額)?[：:]+\s*$/g, '' ),
                    price = get_price_number( jq_price_info_price.text() );
                
                if ( price === '' ) {
                    return;
                }
                
                if ( /(?:小|合|総|)計/.test( name ) ) {
                    return;
                }
                
                other_price_info_list.push( {
                    name : name,
                    price : price
                } );
            } );
            
            var jq_card_type = jq_payment_summary.find( 'table.pmts_payment_method_table .pmts_view_payment_plan_payment_method .pmts-aui-account-number-display:last .pmts-inst-tail' );
            
            card_info.card_type = jq_card_type.text().trim();
            card_info.card_billing_amount = get_price_number( get_child_text_from_jq_element( jq_card_type.parents( 'tr:first' ).find( '.pmts_view_payment_plan_payment_method_coverage_amount' ) ) );
            order_billing_destination = get_child_text_from_jq_element( jq_payment_summary.find( '.pmts_billing_address_block .pmts-account-holder-name' ) );
        }
        else {
            // 古い領収書の場合、支払い情報欄のフォーマットが異なる(2014/04頃を境に変化)
            
            jq_payment_summary = jq_receipt_body.children( 'table.sample' ).find( 'table tr' );
            
            var is_card_type = false,
                is_billing_destination = false,
                card_type_text = '',
                billing_destination_text = '',
                br_counter = 0;
            
            jq_payment_summary.find( 'td:eq(0)' ).contents().each( function () {
                var text_value = '',
                    node_type = this.nodeType;
                
                if ( node_type == 1 ) {
                    switch ( this.tagName ) {
                        case 'B' :
                            text_value = this.textContent;
                            
                            if ( /支払い?方法/.test( text_value ) ) {
                                is_card_type = true;
                                is_billing_destination = false;
                                br_counter = 0;
                            }
                            else if ( /請求先/.test( text_value ) ) {
                                is_card_type = false;
                                is_billing_destination = true;
                                br_counter = 0;
                            }
                            break;
                            
                        case 'BR' :
                            br_counter ++;
                            break;
                    }
                    return;
                }
                
                if ( node_type != 3 ) {
                    return;
                }
                
                if ( br_counter == 1 ) {
                    text_value = this.nodeValue.trim();
                    
                    if ( is_card_type ) {
                        card_type_text += text_value;
                    }
                    else if ( is_billing_destination ) {
                        billing_destination_text += text_value;
                    }
                }
            } );
            
            card_info.card_type = card_type_text.trim();
            order_billing_destination = billing_destination_text.trim();
            
            var jq_price_info_container = jq_payment_summary.find( 'td[align="right"]' ),
                price_info_text = '';
            
            jq_price_info_container.contents().each( function () {
                var text_value = '',
                    node_type = this.nodeType;
                
                if ( node_type == 1 ) {
                    switch ( this.tagName ) {
                        case 'B' :
                            text_value = this.textContent;
                            
                            if ( /総計/.test( text_value ) ) {
                                order_billing_amount =  get_price_number( text_value );
                                return false;
                            }
                            break;
                            
                        case 'BR' :
                            var parts = price_info_text.split( /[:：]/ ),
                                name = '',
                                price = 0;
                            
                            price_info_text = '';
                            
                            if ( parts.length < 2 ) {
                                return;
                            }
                            
                            name = parts[ 0 ].trim();
                            price = get_price_number( parts[ 1 ] );
                            
                            if ( ! price ) {
                                return;
                            }
                            
                            if ( /(?:小|合|総|)計/.test( name ) ) {
                                return;
                            }
                            
                            other_price_info_list.push( {
                                name : name,
                                price : price
                            } );
                            break;
                    }
                    return;
                }
                
                if ( node_type == 3 ) {
                    price_info_text += this.nodeValue.trim();
                }
            } );
            
            if ( order_billing_amount ) {
                card_info.card_billing_amount = order_billing_amount;
            }
        }
        
        order_status = get_child_text_from_jq_element( jq_order_summary_content.find( 'tr:first td[align="center"] font b' ) );
        
        order_url = get_absolute_url( jq_receipt_body.children( 'center:eq(-1)' ).find( 'p > a' ).attr( 'href' ) );
        receipt_url = get_absolute_url( jq_receipt_body.children( 'h2.receipt' ).find( 'a' ).attr( 'href' ) );
        
        order_parameters = {
            order_date : order_date,
            order_id : order_id,
            item_list : item_list,
            other_price_info_list : other_price_info_list,
            order_subtotal_price : order_subtotal_price,
            order_total_price : order_total_price,
            order_destination : order_destination,
            order_status : order_status,
            order_billing_amount : order_billing_amount,
            order_billing_destination : order_billing_destination,
            card_info : card_info,
            order_url : order_url,
            receipt_url : receipt_url
        };
        
        return order_parameters;
    }, // end of get_order_parameters_digital()
    
    
    get_order_parameters_nondigital : function ( jq_receipt_body, item_info_list ) {
        var self = this,
            order_parameters = {},
            order_date = '',
            order_id = '',
            item_group_list = [],
            order_subtotal_price = '',
            order_total_price = '',
            order_billing_destination = '',
            order_billing_amount = '',
            order_url = '',
            receipt_url = '',
            
            card_info_list = [],
            payment_method_list = [],
            payment_method = '',
            error_message = '',
            
            jq_order_container = jq_receipt_body.find( 'table:eq(0) > tbody > tr > td' ),
            jq_order_summary_header = jq_order_container.children( 'table:eq(0)' ),
            jq_order_summary_content_list = jq_order_container.children( 'table:gt(0):lt(-1)' ),
            jq_payment_content = jq_order_container.children( 'table:eq(-1)' ).find( 'table > tbody' ),
            jq_payment_summary = jq_payment_content.children( 'tr:eq(1)' ).find( 'table:first > tbody > tr > td' ),
            jq_payment_billing_destination = jq_payment_summary.find( '.displayAddressDiv .displayAddressUL' ),
            jq_payment_total = jq_payment_summary.find( 'table > tbody > tr > td[align="right"]' ),
            jq_payment_card_info_list = jq_payment_content.children( 'tr:eq(2)' ).find( 'table table tr' ),
            jq_receipt_body_eu_invoice = jq_receipt_body.find( '#eu-invoice' ),
            
            payment_info_list = [];
        
        if ( 0 < jq_receipt_body_eu_invoice.length ) {
            error_message = ( jq_receipt_body_eu_invoice.parents( 'td[align="right"]:first' ).text() + ' ' + get_absolute_url( jq_receipt_body_eu_invoice.find( 'a:last' ).attr( 'href' ) ) ).replace( /\s+/g, ' ' );
        }
        
        /*
        //order_date = get_formatted_date_string( get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文日")):first' ) ) );
        //if ( ! order_date ) {
        //    order_date = get_formatted_date_string( get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("定期おトク便")):first' ) ) );
        //}
        //order_id = get_child_text_from_jq_element( jq_order_summary_header.find( 'td:has(b:contains("注文番号")):first' ) );
        */
        order_date = get_formatted_date_string( get_child_text_from_jq_element(
            jq_order_summary_header.find( 'td' ).filter( function () {
                return ( 0 <= $( this ).find( 'b' ).text().indexOf( '注文日' ) );
            } ).first()
        ) );
        if ( ! order_date ) {
            order_date = get_formatted_date_string( get_child_text_from_jq_element(
                jq_order_summary_header.find( 'td' ).filter( function () {
                    return ( 0 <= $( this ).find( 'b' ).text().indexOf( '定期おトク便' ) );
                } ).first()
            ) );
        }
        order_id = get_child_text_from_jq_element(
            jq_order_summary_header.find( 'td' ).filter( function () {
                return ( 0 <= $( this ).find( 'b' ).text().indexOf( '注文番号' ) );
            } ).first()
        );
        
        order_billing_destination = get_child_text_from_jq_element( jq_payment_billing_destination.find( '.displayAddressFullName' ) );
        
        jq_payment_total.find( '> table > tbody > tr' ).each( function () {
            var $payment_info = $( this ),
                $payment_header = $payment_info.find( '> td[align="right"]:first' ),
                $payment_price = $payment_info.find( '> td[align="right"]:last' ),
                payment_header = get_child_text_from_jq_element( $payment_header ),
                payment_price = get_price_number( get_child_text_from_jq_element( $payment_price ) );
            
            if ( 0 <= payment_header.indexOf( '商品の小計' ) ) {
                order_subtotal_price = payment_price;
            }
            else if ( 0 <= payment_header.indexOf( '注文合計' ) ) {
                order_total_price = payment_price;
            }
            else if ( payment_header ) {
                payment_info_list.push( {
                    header : payment_header.replace( /[:：]\s*$/g, '' ),
                    price : payment_price,
                } );
            }
        } );
        /*
        //order_subtotal_price = get_price_number( get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"]:contains("商品の小計")) > td[align="right"]:eq(-1)' ) ) );
        //order_total_price = get_price_number( get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"]:contains("注文合計")) > td[align="right"]:eq(-1)' ) ) );
        */
        //order_billing_amount = get_price_number( get_child_text_from_jq_element( jq_payment_total.find( 'tr:has(td[align="right"] > b:contains("ご請求額")) > td[align="right"]:eq(-1) b' ) ) );
        order_billing_amount = get_price_number( get_child_text_from_jq_element(
            jq_payment_total.find( 'tr' ).filter( function () {
                return ( 0 <= $( this ).find( 'td[align="right"] > b' ).text().indexOf( 'ご請求額' ) );
            } ).find( '> td[align="right"]:eq(-1) b' )
        ) );
        
        jq_payment_summary.contents().each( function () {
            var text_value = '',
                node_type = this.nodeType;
            
            if ( node_type == 1 ) {
                switch ( this.tagName ) {
                    case 'B' :
                        text_value = this.textContent;
                        
                        if ( payment_method ) {
                            payment_method_list.push( payment_method );
                        }
                        
                        payment_method = '';
                        
                        if ( /請求先/.test( text_value ) ) {
                            return false;
                        }
                        break;
                        
                    case 'BR' :
                        if ( payment_method ) {
                            payment_method_list.push( payment_method );
                        }
                        
                        payment_method = '';
                        break;
                    case 'NOBR' : 
                        text_value = this.textContent;
                        
                        payment_method += text_value.trim();
                        break;
                }
                return;
            }
            
            if ( node_type == 3 ) {
                payment_method += this.nodeValue.trim();
            }
        } );
        
        jq_payment_card_info_list.each( function ( list_index ) {
            var jq_payment_card_info = $( this ),
                card_info_parts = get_child_text_from_jq_element( jq_payment_card_info.find( 'td:eq(0)') ).split( ':' ),
                card_type = '',
                card_billing_date = '',
                card_billing_amount = '';
            
            if ( card_info_parts.length == 3 ) {
                card_type = card_info_parts[ 0 ].trim();
                card_billing_date = get_formatted_date_string( card_info_parts[ 1 ] );
            }
            card_billing_amount = get_price_number( get_child_text_from_jq_element( jq_payment_card_info.find( 'td:eq(1)') ) );
            
            card_info_list.push( {
                card_type : card_type,
                card_billing_date : card_billing_date,
                card_billing_amount : card_billing_amount,
                card_billing_date_ms : ( ( card_billing_date ) ? new Date( card_billing_date ).getTime() : 32503680000000 ) + 23 * 3600000 + list_index,
            } );
        } );
        
        card_info_list.sort( ( a, b ) => a.card_billing_date_ms - b.card_billing_date_ms );
        
        jq_order_summary_content_list.each( function ( list_index ) {
            var item_list = [],
                
                jq_order_summary_content = $( this ).find( 'table > tbody' ),
                jq_order_summary_items = jq_order_summary_content.children( 'tr:eq(1)' ).find( 'table:eq(0) td:eq(0) table:eq(1) tr:gt(0)' ),
                
                jq_order_summary_container = jq_order_summary_content.children( 'tr:eq(2)' ).find( 'table > tbody > tr' ),
                jq_order_summary_destination = jq_order_summary_container.find( '.displayAddressDiv .displayAddressUL' ),
                jq_order_summary_total = jq_order_summary_container.find( 'td[align="right"]' ),
                jq_order_summary_price_infos = jq_order_summary_total.find( 'table:first > tbody > tr' ),
                
                destination = get_child_text_from_jq_element( jq_order_summary_destination.find( '.displayAddressFullName' ) ),
                status = get_child_text_from_jq_element( jq_order_summary_content.children( 'tr:eq(0)' ).find( 'b.sans center' ) ),
                status_date = get_formatted_date_string( status ),
                status_date_ms = ( ( status_date ) ? new Date( status_date ).getTime() : 32503680000000 ) + list_index,
                
                is_gift_token = /^Amazonギフト券$/.test( status ),
                
                subtotal_price = 0,
                total_price = 0,
                billing_amount = 0,
                
                gift_token_info_list = [],
                other_price_info_list = [],
                
                card_info = {
                    card_type : '',
                    card_billing_date : '',
                    card_billing_amount : ''
                },
                min_time_lag_ms = 31622400000;  // 366 * 24 * 60 * 60 * 1000
            
            if ( is_gift_token ) {
                card_info.card_billing_amount = order_billing_amount;
                
                if ( 0 < payment_method_list.length ) {
                    card_info.card_type = payment_method_list[ 0 ];
                }
                
                jq_order_summary_items = jq_order_summary_content.children( 'tr:eq(1)' ).find( 'table:eq(0) td:eq(0) table:gt(0)' );
                
                jq_order_summary_items.each( function () {
                    var jq_item = $( this ),
                        //jq_item_columns = jq_item.find( 'tbody:first > tr > td:not(:has(hr[noshade]))' );
                        jq_item_columns = jq_item.find( 'tbody' ).first().find( '> tr > td' ).filter( function () {
                            return ( $( this ).find( 'hr[noshade]' ).length <= 0 );
                        } );
                    
                    if ( jq_item_columns.length < 2 ) {
                        return;
                    }
                     
                    var jq_item_info = jq_item_columns.eq( 0 ).clone(),
                        jq_item_price = jq_item_columns.eq( 1 ),
                        jq_send_to = jq_item_info.children( 'b:contains("ギフト券を")' ),
                        send_to_parts = jq_send_to.text().split( /[:：]/ ),
                        destination = ( 1 < send_to_parts.length ) ? send_to_parts[ 1 ].trim() : '',
                        item_status = get_child_text_from_jq_element( jq_item_info.find( 'b.h1' ).remove() ),
                        price = get_price_number( get_child_text_from_jq_element( jq_item_price ) ),
                        remarks = jq_item_info.text().replace( /\s+/g, ' ' ).trim(),
                        url = jq_item_info.find( 'a[name="address"]' ).attr( 'href' );
                    
                    
                    gift_token_info_list.push( {
                        name : status,
                        remarks : remarks,
                        price : price,
                        number : 1,
                        status : item_status,
                        destination : destination,
                        url : ( url ) ? url : ''
                    } );
                } );
            }
            else {
                jq_order_summary_items.each( function () {
                    var jq_item = $( this ),
                        jq_item_info = jq_item.find( 'td:eq(0)' ),
                        jq_item_price = jq_item.find( 'td:eq(1)' ),
                        remarks = '',
                        orig_remarks = '',
                        number = 1,
                        price = 0,
                        item_name = '',
                        item_url = '';
                    
                    if ( ( jq_item_info.length <= 0 ) || ( jq_item_price.length <= 0 ) ) {
                        return;
                    }
                    
                    orig_remarks = ( get_child_text_from_jq_element( jq_item_info ) + ' ' + get_child_text_from_jq_element( jq_item_info.find( '.tiny' ) ).replace( /\(\s*\)/, '' ) ).trim();
                    remarks = orig_remarks.replace( /^(\d+)\s*点\s*,?\s*/, '' );
                    
                    if ( remarks != orig_remarks ) {
                        number = parseInt( RegExp.$1, 10 );
                    }
                    
                    item_name = get_child_text_from_jq_element( jq_item_info.find( 'i' ) );
                    item_url = '';
                    
                    $( item_info_list ).each( function () {
                        var item_info = this;
                        
                        if ( ( 0 <= item_info.item_name.indexOf( item_name ) || 0 <= item_name.indexOf( item_info.item_name ) ) ) {
                            item_url = item_info.item_url;
                            return false;
                        }
                    } );
                    
                    price = get_price_number( get_child_text_from_jq_element( jq_item_price ) );
                    item_list.push( {
                        name : item_name,
                        remarks : remarks,
                        price : price,
                        number : number,
                        status : status,
                        url : item_url
                    } );
                    
                    subtotal_price += price * number;
                    
                    if ( ! item_url ) {
                        log_error( '(*) item_url not found: item=', item_list[ item_list.length - 1 ], 'item_info_list=', item_info_list );
                    }
                } );
                
                // 2019.10: 発送毎の明細が記載されなくなった
                /*
                //jq_order_summary_price_infos.each( function () {
                //    var jq_price_info = $( this ),
                //        jq_price_info_columns = jq_price_info.find( 'td' ),
                //        jq_price_info_name = jq_price_info_columns.eq( 0 ),
                //        jq_price_info_price = jq_price_info_columns.eq( 1 ),
                //        name = jq_price_info_name.text().trim().replace( /(?:の金額)?[：:]+\s*$/g, '' ),
                //        price = get_price_number( jq_price_info_price.text() );
                //    
                //    if ( price === '' ) {
                //        return;
                //    }
                //    
                //    if ( /商品の小計/.test( name ) ) {
                //        subtotal_price = price;
                //        return;
                //    }
                //    
                //    if ( /注文合計/.test( name ) ) {
                //        total_price = price;
                //        return;
                //    }
                //    
                //    if ( /請求額/.test( name ) ) {
                //        billing_amount = price;
                //        return;
                //    }
                //    
                //    if ( /支払い合計/.test( name ) ) {
                //        return;
                //    }
                //    
                //    other_price_info_list.push( {
                //        name : name,
                //        price : price
                //    } );
                //} );
                //
                //if ( billing_amount !== '' ) {
                //    $.each( card_info_list, function ( index, temp_card_info ) {
                //        // TODO: カード請求が同じ金額で複数ある場合におかしくなってしまう（発送日と請求日にもずれがある）
                //        // → とりあえず、発送日と請求日の差が一番小さいものを選択することにして、様子見
                //        if ( temp_card_info.card_billing_amount == billing_amount ) {
                //            if ( ( ! status_date ) || ( ! temp_card_info.card_billing_date ) ) {
                //                card_info = temp_card_info;
                //                return;
                //            }
                //            
                //            var time_lag_ms = Math.abs( new Date( temp_card_info.card_billing_date ).getTime() - status_date_ms );
                //            
                //            if ( time_lag_ms < min_time_lag_ms ) {
                //                min_time_lag_ms = time_lag_ms;
                //                card_info = temp_card_info;
                //            }
                //        }
                //    } );
                //}
                */
            }
            
            item_group_list.push( {
                is_gift_token : is_gift_token,
                item_list : item_list,
                gift_token_info_list : gift_token_info_list,
                other_price_info_list : other_price_info_list,
                subtotal_price : subtotal_price,
                total_price : total_price,
                destination : destination,
                status : status,
                billing_amount : billing_amount,
                card_info : card_info,
                status_date_ms : status_date_ms,
            } );
        } );
        
        item_group_list.sort( ( a, b ) => a.status_date_ms - b.status_date_ms );
        
        order_url = get_absolute_url( jq_receipt_body.children( 'center:eq(-1)' ).find( 'p > a' ).attr( 'href' ) );
        receipt_url = get_absolute_url( jq_receipt_body.children( 'h2.receipt' ).find( 'a' ).attr( 'href' ) );
        
        order_parameters = {
            order_date : order_date,
            order_id : order_id,
            item_group_list : item_group_list,
            order_subtotal_price : order_subtotal_price,
            order_total_price : order_total_price,
            order_billing_destination : order_billing_destination,
            order_billing_amount : order_billing_amount,
            order_url : order_url,
            receipt_url : receipt_url,
            card_info_list : card_info_list,
            payment_method_list : payment_method_list,
            payment_info_list : payment_info_list,
            error_message : error_message,
        };
        
        return order_parameters;
    }, // end of get_order_parameters_nondigital()
    
    
    create_csv_download_button : function ( jq_parent ) {
        var self = this,
            jq_csv_download_button = self.jq_csv_download_button = $( '<button class="noprint"/>' );
        
        jq_csv_download_button
            .attr( 'id', SCRIPT_NAME + '-csv-download-button' )
            .text( OPTIONS.CSV_DOWNLOAD_BUTTON_TEXT )
            .css( {
                'margin' : '4px',
                'cursor' : 'pointer'
            } )
            .click( function ( event ) {
                self.onclick_csv_download_button( event );
            } )
            .prependTo( jq_parent );
        
        return self;
    }, // end of create_csv_download_button()
    
    
    create_refund_csv_download_button : function ( jq_parent ) {
        var self = this;
        
        if ( self.refund_info_container_list.length <= 0 ) {
            return self;
        }
        
        var jq_refund_csv_download_button = self.jq_refund_csv_download_button = $( '<button class="noprint"/>' );
        
        jq_refund_csv_download_button
            .attr( 'id', SCRIPT_NAME + '-refund-csv-download-button' )
            .text( OPTIONS.REFUND_CSV_DOWNLOAD_BUTTON_TEXT )
            .css( {
                'margin' : '4px',
                'cursor' : 'pointer'
            } )
            .click( function ( event ) {
                self.onclick_refund_csv_download_button( event );
            } )
            .prependTo( jq_parent );
        
        return self;
    }, // end of create_refund_csv_download_button()
    
    
    create_change_addressee_button : function ( jq_parent ) {
        var self = this;
        
        if ( ! OPTIONS.ADDRESSEE_CHANGEABLE ) {
            return self;
        }
        
        var jq_change_addressee_button = self.jq_change_addressee_button = $( '<button class="noprint"/>' );
        
        jq_change_addressee_button
            .attr( 'id', SCRIPT_NAME + '-change-addressee-button' )
            .text( OPTIONS.CHANGE_ADDRESSEE_BUTTON_TEXT )
            .css( {
                'margin' : '4px',
                'cursor' : 'pointer'
            } )
            .click( function ( event ) {
                self.onclick_change_addressee_button( event );
            } )
            .prependTo( jq_parent );
        
        return self;
    }, // end of create_change_addressee_button()
    
    
    create_print_preview_button : function ( jq_parent ) {
        var self = this;
        
        if ( ( ! OPTIONS.ENABLE_PRINT_PREVIEW_BUTTON ) || ( ! IS_FIREFOX ) || ( ! IS_WEB_EXTENSION ) ) {
            return self;
        }
        
        var jq_print_preview_button = self.jq_print_preview_button = $( '<button class="noprint"/>' );
        
        jq_print_preview_button
            .attr( 'id', SCRIPT_NAME + '-print-preview-button' )
            .text( OPTIONS.PRINT_PREVIEW_BUTTON_TEXT )
            .css( {
                'margin' : '4px',
                'cursor' : 'pointer'
            } )
            .click( function ( event ) {
                self.onclick_print_preview_button( event );
            } )
            .prependTo( jq_parent );
        
        return self;
    }, // end of create_print_preview_button()
    
    
    onclick_csv_download_button : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.download_csv();
        
        return self;
    }, // end of onclick_csv_download_button()
    
    
    onclick_refund_csv_download_button : function ( event ) {
        var self = this;
        
        event.stopPropagation();
        event.preventDefault();
        
        self.download_refund_csv();
        
        return self;
    }, // end of onclick_refund_csv_download_button()
    
    
    onclick_change_addressee_button : function ( event ) {
        var self = this,
            new_addressee;
        
        event.stopPropagation();
        event.preventDefault();
        
        new_addressee = prompt( OPTIONS.CHANGE_ADDRESSEE_PROMPT_MESSAGE, self.addressee );
        
        if ( ( new_addressee === null ) || ( new_addressee === self.addressee ) ) {
            return self;
        }
        
        self.addressee = new_addressee;
        set_value( SCRIPT_NAME + '-addressee', self.addressee );
        
        self.jq_body.find( '.addressee' ).text( new_addressee );
        
        return self;
    }, // end of onclick_change_addressee_button()
    
    
    onclick_print_preview_button : function ( event ) {
        var self = this,
            new_addressee;
        
        event.stopPropagation();
        event.preventDefault();
        
        browser.runtime.sendMessage( {
            type : 'PRINT_PREVIEW_REQUEST'
        }, function ( response ) {
            log_debug( response );
        } );
        
        return self;
    }, // end of onclick_print_preview_button()
    
    
    download_csv : function () {
        var self = this;
        
        if ( ! self.jq_csv_download_link ) {
            self.create_csv();
        }
        
        self.jq_csv_download_link[ 0 ].click();
        
        return self;
    }, // end of download_csv()
    
    
    download_refund_csv : function () {
        var self = this;
        
        if ( ! self.jq_refund_csv_download_link ) {
            self.create_refund_csv();
        }
        
        self.jq_refund_csv_download_link[ 0 ].click();
        
        return self;
    }, // end of download_refund_csv()
    
    
    create_csv : function () {
        var self = this,
            open_parameters = self.open_parameters,
            url_to_page_info = self.url_to_page_info,
            csv_lines = [],
            order_url_list = [ open_parameters.first_order_url ].concat( open_parameters.additional_order_urls ),
            filename = self.get_csv_filename( 'amazon-order' );
        
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
                        /*
                        //( item_index == 0 ) ? order_parameters.order_total_price : '', // 注文合計(送料・手数料含む)
                        // TODO: order_total_price は、手数料・割引などが反映されている場合（プロモーション等）とされていない場合（Amazonポイント等）がある
                        */
                        ( item_index == 0 ) ? order_parameters.order_subtotal_price : '', // 注文合計(送料・手数料含む)
                        order_parameters.order_destination, // お届け先
                        order_parameters.order_status, // 状態
                        order_parameters.order_billing_destination, // 請求先
                        ( item_index == 0 ) ? order_parameters.order_billing_amount : '', // 請求額
                        order_parameters.card_info.card_billing_date, // クレカ請求日
                        ( item_index == 0 ) ? order_parameters.card_info.card_billing_amount : '', // クレカ請求額
                        ( order_parameters.card_info.card_billing_amount ) ? order_parameters.card_info.card_type : '', // クレカ種類
                        order_parameters.order_url, // 注文概要URL
                        order_parameters.receipt_url, // 領収書URL
                        item.url // 商品URL
                    ] ) );
                } );
                
                order_parameters.other_price_info_list.forEach( function ( other_price_info ) {
                    if ( other_price_info.price == 0 ) {
                        return;
                    }
                    
                    csv_lines.push( self.create_csv_line( [
                        order_parameters.order_date, // 注文日
                        order_parameters.order_id, // 注文番号
                        '（' + other_price_info.name + '）', // 商品名
                        ( other_price_info.price < 0 ) ? '※カード外支払→請求額に反映' : '※注文合計に反映', // 付帯情報
                        /*
                        //other_price_info.price, // 価格
                        //1, // 個数
                        //'', // 商品小計
                        //'', // 注文合計(送料・手数料含む)
                        */
                        '', // 価格
                        '', // 個数
                        ( 0 < other_price_info.price ) ? other_price_info.price : '', // 商品小計
                        ( other_price_info.price < 0 ) ? other_price_info.price : '', // 注文合計
                        order_parameters.order_destination, // お届け先
                        order_parameters.order_status, // 状態
                        order_parameters.order_billing_destination, // 請求先
                        '', // 請求額
                        order_parameters.card_info.card_billing_date, // クレカ請求日
                        '', // クレカ請求額
                        ( order_parameters.card_info.card_billing_amount ) ? order_parameters.card_info.card_type : '', // クレカ種類
                        order_parameters.order_url, // 注文概要URL
                        order_parameters.receipt_url, // 領収書URL
                        '' // 商品URL
                    ] ) );
                } );
            } );
        }
        else {
            order_url_list.forEach( function ( order_url ) {
                var order_parameters = url_to_page_info[ order_url ].order_parameters,
                    card_billing_amount = 0,
                    card_type = '',
                    card_type_map = {},
                    current_card_info_index = 0,
                    current_card_info;
                
                order_parameters.card_info_list.forEach( ( card_info ) => {
                    card_type_map[ card_info.card_type ] = card_info.card_type;
                    card_billing_amount += card_info.card_billing_amount || 0;
                } );
                
                card_type = Object.keys( card_type_map ).join( ', ' );
                
                csv_lines.push( self.create_csv_line( [
                    order_parameters.order_date, // 注文日
                    order_parameters.order_id, // 注文番号
                    '（注文全体）', // 商品名
                    ( order_parameters.error_message ) ? order_parameters.error_message : '', // 付帯情報
                    '', // 価格
                    '', // 個数
                    '', // 商品小計
                    order_parameters.order_total_price, // 注文合計
                    '', // お届け先
                    '', // 状態
                    order_parameters.order_billing_destination, // 請求先
                    order_parameters.order_billing_amount, // 請求額
                    '', // クレカ請求日
                    '', // クレカ請求額
                    card_type, // クレカ種類
                    order_parameters.order_url, // 注文概要URL
                    order_parameters.receipt_url, // 領収書URL
                    '', // 商品URL
                ] ) );
                
                order_parameters.item_group_list.forEach( function ( item_group ) {
                    for ( ; current_card_info_index < order_parameters.card_info_list.length; current_card_info_index ++ ) {
                        current_card_info = order_parameters.card_info_list[ current_card_info_index ];
                        
                        if ( item_group.status_date_ms < current_card_info.card_billing_date_ms ) {
                            break;
                        }
                        
                        csv_lines.push( self.create_csv_line( [
                            order_parameters.order_date, // 注文日
                            order_parameters.order_id, // 注文番号
                            '（クレジットカードへの請求）', // 商品名
                            '', // 付帯情報
                            '', // 価格
                            '', // 個数
                            '', // 商品小計
                            '', // 注文合計
                            '', // お届け先
                            '', // 状態
                            order_parameters.order_billing_destination, // 請求先
                            '', // 請求額
                            current_card_info.card_billing_date, // クレカ請求日
                            current_card_info.card_billing_amount, // クレカ請求額
                            current_card_info.card_type, // クレカ種類
                            order_parameters.order_url, // 注文概要URL
                            order_parameters.receipt_url, // 領収書URL
                            '', // 商品URL
                        ] ) );
                    }
                    
                    item_group.item_list.forEach( function ( item, item_index ) {
                        csv_lines.push( self.create_csv_line( [
                            order_parameters.order_date, // 注文日
                            order_parameters.order_id, // 注文番号
                            item.name, // 商品名
                            item.remarks, // 付帯情報
                            item.price, // 価格
                            item.number, // 個数
                            ( item_index == 0 ) ? item_group.subtotal_price : '', // 商品小計
                            /*
                            // 2019.10: 発送毎の明細が記載されなくなった
                            //( item_index == 0 ) ? item_group.total_price : '', // 注文合計(送料・手数料含む)
                            */
                            '', // 注文合計
                            item_group.destination, // お届け先
                            item_group.status, // 状態
                            order_parameters.order_billing_destination, // 請求先
                            /*
                            // 2019.10: 発送毎の明細が記載されなくなった
                            //( item_index == 0 ) ? item_group.billing_amount : '', // 請求額
                            //item_group.card_info.card_billing_date, // クレカ請求日
                            //( item_index == 0 ) ? item_group.card_info.card_billing_amount : '', // クレカ請求額
                            //( item_group.card_info.card_billing_amount ) ? item_group.card_info.card_type : '', // クレカ種類
                            */
                            '', // 請求額
                            '', // クレカ請求日
                            '', // クレカ請求額
                            card_type, // クレカ種類
                            order_parameters.order_url, // 注文概要URL
                            order_parameters.receipt_url, // 領収書URL
                            item.url, // 商品URL
                        ] ) );
                    } );
                    
                    item_group.gift_token_info_list.forEach( function ( item, item_index ) {
                        csv_lines.push( self.create_csv_line( [
                            order_parameters.order_date, // 注文日
                            order_parameters.order_id, // 注文番号
                            item.name, // 商品名
                            item.remarks, // 付帯情報
                            item.price, // 価格
                            item.number, // 個数
                            /*
                            // 2019.10: 発送毎の明細が記載されなくなった
                            //( item_index == 0 ) ? order_parameters.order_subtotal_price : '', // 商品小計
                            //( item_index == 0 ) ? order_parameters.order_total_price : '', // 注文合計(送料・手数料含む)
                            */
                            ( item_index == 0 ) ? order_parameters.order_total_price : '', // 商品小計
                            '', // 注文合計
                            item.destination, // お届け先
                            item.status, // 状態
                            order_parameters.order_billing_destination, // 請求先
                            /*
                            // 2019.10: 発送毎の明細が記載されなくなった
                            //( item_index == 0 ) ? order_parameters.order_billing_amount : '', // 請求額
                            //item_group.card_info.card_billing_date, // クレカ請求日
                            //( item_index == 0 ) ? item_group.card_info.card_billing_amount : '', // クレカ請求額
                            //( item_group.card_info.card_billing_amount ) ? item_group.card_info.card_type : '', // クレカ種類
                            */
                            '', // 請求額
                            '', // クレカ請求日
                            '', // クレカ請求額
                            card_type, // クレカ種類
                            order_parameters.order_url, // 注文概要URL
                            order_parameters.receipt_url, // 領収書URL
                            item.url, // 商品URL
                        ] ) );
                    } );
                    
                    // 2019.10: 発送毎の明細が記載されなくなった
                    /*
                    //item_group.other_price_info_list.forEach( function ( other_price_info ) {
                    //    if ( other_price_info.price == 0 ) {
                    //        return;
                    //    }
                    //    
                    //    csv_lines.push( self.create_csv_line( [
                    //        order_parameters.order_date, // 注文日
                    //        order_parameters.order_id, // 注文番号
                    //        '（' + other_price_info.name + '）', // 商品名
                    //        ( other_price_info.price < 0 ) ? '※カード外支払→請求額に反映' : '※注文合計に反映', // 付帯情報
                    //        other_price_info.price, // 価格
                    //        1, // 個数
                    //        '', // 商品小計
                    //        '', // 注文合計(送料・手数料含む)
                    //        item_group.destination, // お届け先
                    //        item_group.status, // 状態
                    //        order_parameters.order_billing_destination, // 請求先
                    //        '', // 請求額
                    //        item_group.card_info.card_billing_date, // クレカ請求日
                    //        '', // クレカ請求額
                    //        ( item_group.card_info.card_billing_amount ) ? item_group.card_info.card_type : '', // クレカ種類
                    //        order_parameters.order_url, // 注文概要URL
                    //        order_parameters.receipt_url, // 領収書URL
                    //        '', // 商品URL
                    //    ] ) );
                    //} );
                    */
                } );
                
                for ( ; current_card_info_index < order_parameters.card_info_list.length; current_card_info_index ++ ) {
                    current_card_info = order_parameters.card_info_list[ current_card_info_index ];
                    csv_lines.push( self.create_csv_line( [
                        order_parameters.order_date, // 注文日
                        order_parameters.order_id, // 注文番号
                        '（クレジットカードへの請求）', // 商品名
                        '', // 付帯情報
                        '', // 価格
                        '', // 個数
                        '', // 商品小計
                        '', // 注文合計
                        '', // お届け先
                        '', // 状態
                        order_parameters.order_billing_destination, // 請求先
                        '', // 請求額
                        current_card_info.card_billing_date, // クレカ請求日
                        current_card_info.card_billing_amount, // クレカ請求額
                        current_card_info.card_type, // クレカ種類
                        order_parameters.order_url, // 注文概要URL
                        order_parameters.receipt_url, // 領収書URL
                        '', // 商品URL
                    ] ) );
                }
                
                order_parameters.payment_info_list.forEach( ( payment_info ) => {
                    if ( payment_info.price == 0 ) {
                        return;
                    }
                    
                    csv_lines.push( self.create_csv_line( [
                        order_parameters.order_date, // 注文日
                        order_parameters.order_id, // 注文番号
                        '（' + payment_info.header + '）', // 商品名
                        '※（注文全体）' + ( ( payment_info.price < 0 ) ? '請求額に反映' : '注文合計に反映' ), // 付帯情報
                        '', // 価格
                        '', // 個数
                        ( 0 < payment_info.price ) ? payment_info.price : '', // 商品小計
                        ( payment_info.price < 0 ) ? payment_info.price : '', // 注文合計
                        '', // お届け先
                        '', // 状態
                        order_parameters.order_billing_destination, // 請求先
                        '', // 請求額
                        '', // クレカ請求日
                        '', // クレカ請求額
                        card_type, // クレカ種類
                        order_parameters.order_url, // 注文概要URL
                        order_parameters.receipt_url, // 領収書URL
                        '', // 商品URL
                    ] ) );
                } );
            } );
        }
        
        self.jq_csv_download_link = self.creat_csv_download_link( csv_lines, filename )
            .prependTo( self.jq_body );
        
        return self;
    }, // end of create_csv()
    
    
    create_refund_csv : function () {
        var self = this,
            open_parameters = self.open_parameters,
            csv_lines = [],
            filename = self.get_csv_filename( 'amazon-refund' );
        
        csv_lines.push( self.create_csv_line( self.refund_csv_header_columns ) );
        
        self.refund_info_container_list.forEach( function ( refund_info_container ) {
            var order_parameters = refund_info_container.order_parameters,
                refund_info = refund_info_container.refund_info,
                card_type = '';
            
            if ( open_parameters.is_digital ) {
                card_type = order_parameters.card_info.card_type;
            }
            else {
                if ( 0 < order_parameters.payment_method_list.length ) {
                    card_type = order_parameters.payment_method_list[ 0 ];
                }
            }
            
            refund_info.refund_list.forEach( function ( refund ) {
                csv_lines.push( self.create_csv_line( [
                    order_parameters.order_date, // 注文日
                    order_parameters.order_id, // 注文番号
                    refund.date, // 返金日
                    refund.price, // 返金額
                    order_parameters.order_billing_destination, // 返金先
                    card_type, // クレカ種類
                    refund.remarks, // 備考
                    order_parameters.order_url, // 注文概要URL
                    order_parameters.receipt_url, // 領収書URL
                    refund_info.refund_invoice_url // 返金通知書URL
                ] ) );
            } );
        } );
        
        self.jq_refund_csv_download_link = self.creat_csv_download_link( csv_lines, filename )
            .prependTo( self.jq_body );
        
        return self;
    }, // end of create_refund_csv()
    
    
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
    }, // end of create_csv_line()
    
    
    get_csv_filename : function ( prefix ) {
        var self = this,
            open_parameters = self.open_parameters,
            filename_parts = [ prefix ],
            keyword_string = open_parameters.target_keyword_string;
        
        filename_parts.push( ( ( open_parameters.is_digital ) ? '' : 'non-' ) + 'digital' );
        
        filename_parts.push( open_parameters.target_period + ( ( 0 < open_parameters.target_month ) ? '-' + open_parameters.target_month : ''  ) );
        
        if ( open_parameters.target_destination ) {
            filename_parts.push( 'to-' + open_parameters.target_destination );
        }
        
        if ( keyword_string ) {
            if ( 50 < keyword_string.length ) {
                keyword_string = keyword_string.substr( 0, 49 ) + '…';
            }
            filename_parts.push( 'filter' + ( ( open_parameters.target_keyword_is_ruled_out ) ? '-not' : '' ) + '(' + keyword_string + ')' );
        }
        
        return get_safefilename( filename_parts.join( '_' ) ) + '.csv';
    }, // end of get_csv_filename()
    
    
    creat_csv_download_link : function ( csv_lines, filename ) {
        var csv = csv_lines.join( '\r\n' ),
            bom = new Uint8Array( [ 0xEF, 0xBB, 0xBF ] ),
            blob = new Blob( [ bom, csv ], { 'type' : 'text/csv' } ),
            blob_url = URL.createObjectURL( blob ),
            jq_csv_download_link = $( '<a/>' );
        
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
            } );
        
        return jq_csv_download_link;
    } // end of create_csv_download_link()
    
}; // end of TemplateReceiptOutputPage

// }


// ■ ページ初期化処理 {
function is_order_history_page() {
    return /^https?:\/\/[^\/]+\/gp\/(?:your-account|css)\/order-history/.test( window.location.href );
} // end of is_order_history_page()


function is_receipt_page() {
    return /^https?:\/\/[^\/]+\/gp\/(?:digital\/your-account\/order-summary\.html|css\/summary\/print\.html)/.test( window.location.href );
} // end of is_receipt_page()


function is_signin_page() {
    return /^https?:\/\/[^\/]+\/ap\/signin/.test( window.location.href );
} // end of is_signin_page()


function init_order_history_page() {
    if ( ! OPTIONS.OPERATION ) {
        return;
    }
    
    if ( ! is_order_history_page() ) {
        return;
    }
    
    ORDER_HISTORY_FILTER = object_extender( TemplateOrderHistoryFilter ).init( ! OPTIONS.OPERATION );
    
} // end of init_order_history_page()


function init_first_order_page( open_parameters ) {
    if ( ! OPTIONS.OPERATION ) {
        return;
    }
    
    if ( ! is_receipt_page() ) {
        return;
    }
    
    object_extender( TemplateReceiptOutputPage ).init( open_parameters );

} // end of init_first_order_page()


function init_order_page_in_iframe( open_parameters ) {
    if ( ! OPTIONS.OPERATION ) {
        return;
    }
    
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
    
    var order_detail_url = get_absolute_url( $( 'body > center:eq(-1) p > a' ).attr( 'href' ) ),
        order_detail_page_info = null,
        rendering_result = null,
        
        on_rendering_complete = function ( result ) {
            rendering_result = result;
            
            finish();
        },
        
        get_refund_info_digital = function ( jq_html_fragment ) {
            var refund_list = [],
                refund_info = {
                    refund_invoice_url : '',
                    refund_list : refund_list
                },
                refund_invoice_url = jq_html_fragment.find( 'a.a-link-normal[href*="/invoice/download"]:contains("返金通知書")' ).attr( 'href' );
            
            if ( refund_invoice_url ) {
                refund_info.refund_invoice_url = get_absolute_url( refund_invoice_url );
            }
            
            //jq_html_fragment.find( '#digitalOrderSummaryContainer > .orderSummary:has(.section-header:contains("払い戻し")) > table.sample > tbody > tr' )
            jq_html_fragment.find( '#digitalOrderSummaryContainer > .orderSummary' ).filter( function () {
                return ( 0 <= $( this ).find( '.section-header' ).text().indexOf( '払い戻し' ) );
            } ).find( '> table.sample > tbody > tr' )
            .each( function () {
                var jq_refund = $( this );
                
                refund_list.push( {
                    date : get_formatted_date_string( jq_refund.find( 'td > strong' ).text() ),
                    price : get_price_number( jq_refund.find( 'td[align="right"]' ).text() ),
                    remarks : ''
                } );
            } );
            
            return refund_info;
        }, // end of get_refund_info_digital()
        
        get_refund_info_nondigital = function ( jq_html_fragment ) {
            var refund_list = [],
                refund_info = {
                    refund_invoice_url : '',
                    refund_list : refund_list
                };
            
            //jq_html_fragment.find( '#orderDetails .a-spacing-base .a-row.a-expander-container:has(.a-expander-prompt:contains("取引履歴")) .a-expander-content .a-color-success:has(.a-text-bold:contains("返金"))' )
            jq_html_fragment.find( '#orderDetails .a-spacing-base .a-row.a-expander-container' ).filter( function () {
                return ( 0 <= $( this ).find( '.a-expander-prompt' ).text().indexOf( '取引履歴' ) );
            } ).find( '.a-expander-content .a-color-success' ).filter( function () {
                return ( 0 <= $( this ).find( '.a-text-bold' ).text().indexOf( '返金' ) );
            } )
            .each( function () {
                var jq_refund = $( this ),
                    refund_text = jq_refund.find( '.a-text-bold:contains("返金")' ).text().trim();
                
                refund_list.push( {
                    date : get_formatted_date_string( refund_text ),
                    price : get_price_number( refund_text.replace( /^[^￥]+/, '' ) ),
                    remarks : ( refund_text.match( /^\s*([^:]+:\s*[^\s]+)/ ) ) ? RegExp.$1 : ''
                } );
            } );
            
            return refund_info;
        }, // end of get_refund_info_nondigital()
        
        get_item_info_list_digital = function ( jq_html_fragment ) {
            var item_info_list = [];
            
            jq_html_fragment.find( '.orderSummary a[href*="/dp/"]' ).each( function () {
                var jq_item_link = $( this );
                
                item_info_list.push( {
                    item_url : get_absolute_url( jq_item_link.attr( 'href' ) ),
                    item_name : jq_item_link.text().replace( /[\s\u00a0\ufffd]+/g, ' ' ).trim()
                } );
            } );
            
            return item_info_list;
        }, // end of get_item_info_digital()
        
        get_item_info_list_nondigital = function ( jq_html_fragment ) {
            var item_info_list = [];
            
            //jq_html_fragment.find( '.shipment:not(:has(.a-text-bold:contains("返品"))) a.a-link-normal[href*="/gp/product/"]:not(:has(img))' )
            jq_html_fragment.find( '.shipment' ).filter( function () {
                return ( $( this ).find( '.a-text-bold' ).text().indexOf( '返品' ) <  0 );
            } ).find( 'a.a-link-normal[href*="/gp/product/"]' ).filter( function () {
                return ( $( this ).find( 'img' ).length <= 0 );
            } )
            .each( function () {
                var jq_item_link = $( this );
                
                item_info_list.push( {
                    item_url : get_absolute_url( jq_item_link.attr( 'href' ) ),
                    item_name : jq_item_link.text().replace( /[\s\u00a0\ufffd]+/g, ' ' ).trim()
                } );
            } );
            
            return item_info_list;
        }, // end of get_item_info_nondigital()
        
        finish = function () {
            if ( ( ! order_detail_page_info ) || ( ! rendering_result ) ) {
                return;
            }
            
            var rendering_result_html = rendering_result.html;
            
            delete rendering_result.html;
            
            window.parent.postMessage( {
                request_order_url : open_parameters.request_order_url,
                html : rendering_result_html,
                order_detail_page_info : order_detail_page_info,
                rendering_result : rendering_result
            }, get_origin_url() ); // ※第二引数は targetOrigin（window.parentの生成元）→同一ドメインのため、簡略化
        }; // end of finish()
    
    wait_for_rendering( on_rendering_complete );
    
    $.ajax( {
        url : order_detail_url,
        type : 'GET',
        dataType : 'html',
        headers : { 'Accept' : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8" },
        crossDomain : true // リクエストヘッダに X-Requested-With : XMLHttpRequest を含まないようにしないと、Amazon から HTML ではない形式で返されてしまう
    } )
        .done( function ( html ) {
            var jq_html_fragment = get_jq_html_fragment( html ),
                refund_info = ( open_parameters.is_digital ) ? get_refund_info_digital( jq_html_fragment ) : get_refund_info_nondigital( jq_html_fragment ),
                item_info_list = ( open_parameters.is_digital ) ? get_item_info_list_digital( jq_html_fragment ) : get_item_info_list_nondigital( jq_html_fragment );
            
            order_detail_page_info = {
                url : order_detail_url,
                success : true,
                //html : html,
                refund_info : refund_info,
                item_info_list : item_info_list
            };
            
            finish();
        } )
        .fail( function ( jqXHR, textStatus, errorThrown ) {
            log_error( order_detail_url, textStatus );
            
            order_detail_page_info = {
                url : order_detail_url,
                success : false,
                error_message : 'Fetch Failure'
            };
            
            finish();
        } );
    
} // end of init_order_page_in_iframe()


function on_update_options( updated_options ) {
    if ( updated_options ) {
        Object.keys( updated_options ).forEach( function ( name ) {
            if ( updated_options[ name ] === null ) {
                OPTIONS[ name ] = DEFAULT_OPTIONS[ name ];
                return;
            }
            OPTIONS[ name ] = updated_options[ name ];
        } );
    }
    
    if ( ! ORDER_HISTORY_FILTER ) {
        init_order_history_page();
        return;
    }
    
    if ( Object.hasOwnProperty.call( updated_options, 'OPERATION' ) ) {
        if ( OPTIONS.OPERATION ) {
            ORDER_HISTORY_FILTER.activate();
        }
        else {
            ORDER_HISTORY_FILTER.suspend();
        }
    }
    
} // end of on_update_options()


function initialize( user_options ) {
    Object.keys( OPTIONS ).forEach( function ( name ) {
        DEFAULT_OPTIONS[ name ] = OPTIONS[ name ];
    } );
    
    if ( user_options ) {
        Object.keys( user_options ).forEach( function ( name ) {
            if ( user_options[ name ] === null ) {
                return;
            }
            OPTIONS[ name ] = user_options[ name ];
        } );
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
            init_order_page_in_iframe( open_parameters );
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
    }, function ( updated_options ) {
        on_update_options( updated_options );
    } );
}
else {
    initialize();
}

// }


} )();

// ■ end of file
