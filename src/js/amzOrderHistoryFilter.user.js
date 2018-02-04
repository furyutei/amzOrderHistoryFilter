// ==UserScript==
// @name            amzOrderHistoryFilter
// @namespace       http://furyu.hatenablog.com/
// @author          furyu
// @version         0.1.0.1
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
*/

/*
The MIT License (MIT)

Copyright (c) 2016 furyu <furyutei@gmail.com>

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
    
    DEFAULT_FILTER_INCLUDE_DIGITAL : true, // フィルタ対象(デジタルコンテンツ)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_NONDIGITAL : false, // フィルタ対象(デジタルコンテンツ以外)のデフォルト値(true: 有効)
    DEFAULT_FILTER_INCLUDE_RESERVATION : true, // フィルタ対象(予約)のデフォルト値(true: 有効)
    
    OPERATION : true // true: 動作中、false: 停止中
};

// }


// ■ 共通変数 {
var SCRIPT_NAME = 'amzOrderHistoryFilter',
    DEBUG = true;

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
    WEB_EXTENSION_INIT = window[ SCRIPT_NAME + '_web_extension_init' ];


OPTIONS.SELECT_MONTH_LABEL_TEXT = "対象月選択";
OPTIONS.SELECT_MONTH_NO_SELECT_TEXT = "未選択";
OPTIONS.SELECT_MONTH_ALL_TEXT = "通年";
OPTIONS.CHECKBOX_FILTER_INCLUDE_DIGITAL_TEXT = 'デジタル';
OPTIONS.CHECKBOX_FILTER_INCLUDE_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.CHECKBOX_FILTER_INCLUDE_RESERVATION_TEXT = '予約分を含む';
OPTIONS.COUNTER_LABEL_DIGITAL_TEXT = 'デジタル';
OPTIONS.COUNTER_LABEL_NONDIGITAL_TEXT = 'デジタル以外';
OPTIONS.PRINT_RECEIPT_BUTTON_TEXT = "領収書印刷用画面";

// }


// ■ 関数 {
function to_array( array_like_object ) {
    return Array.prototype.slice.call( array_like_object );
} // end of to_array()


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
                
                //jq_iframe.attr( 'src', url );
                
                $( document.documentElement ).append( jq_iframe );
                
                child_window = jq_iframe[ 0 ].contentWindow;
                child_window.name = name;
                child_window.location.href = url;
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
    
    init : function () {
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
        
        return self;
    },
    
    show : function () {
        var self = this;
        
        self.jq_loading_dialog.show();
        
        return self;
    },
    
    hide : function () {
        var self = this;
        
        self.jq_loading_dialog.hide();
        
        return self;
    }
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
        
        var year = self.year = RegExp.$1,
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
        
        jq_select_month
            .val( -1 )
            .change( function ( event ) {
                self.onchange_month( event );
            } );
        
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
            target_month = parseInt( jq_select_month.val(), 10 ),
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
           
            open_child_window( nondigital_first_order_url, {
                open_parameters : {
                    first_order_url : nondigital_first_order_url,
                    additional_order_urls : nondigital_order_urls,
                    show_print_dialog : show_print_dialog
                }
            } );
        }
        
        if ( print_digital ) {
            var digital_first_order_url = digital_order_urls.shift();
           
            open_child_window( digital_first_order_url, {
                open_parameters : {
                    first_order_url : digital_first_order_url,
                    additional_order_urls : digital_order_urls,
                    show_print_dialog : show_print_dialog
                }
            } );
        }
        
        return self;
    } // end of open_order_receipts_for_print()

}; // end of TemplateOrderHistoryFilter

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
    
    var loading_dialog = object_extender( TemplateLoadingDialog ).init().show(),
        result_waiting_counter = 1 + open_parameters.additional_order_urls.length,
        current_receipt_number = 1,
        remaining_request_order_urls = open_parameters.additional_order_urls.slice( 0 ),
        max_request_number = 10,
        request_counter = 0,
        
        jq_body = $( 'body' ),
        jq_header_template = $( '<h2 class="receipt"><a/></h2>' ),
        jq_hr_template = $( '<hr class="receipt"/>' ),
        
        url_to_page_info = {},
        
        create_jq_header = function ( receipt_number, receipt_url ) {
            var jq_header = jq_header_template.clone(),
                jq_link = jq_header.find( 'a' ).attr( {
                    'href' : receipt_url,
                    'target' : '_blank'
                } ).text( 'No.' + receipt_number );
            
            return jq_header;
        }, // end of create_jq_header()
        
        create_jq_elements = function ( html, receipt_number, receipt_url ) {
            return $( '<div/>' ).html( html ).prepend( create_jq_header( receipt_number, receipt_url ) ).prepend( jq_hr_template.clone() ).children();
        }, // end of create_jq_elements()
        
        on_rendering_complete = function ( html ) {
            log_debug( '*** on_rendering_complete: result_waiting_counter=', result_waiting_counter );
            
            var page_info = url_to_page_info[ open_parameters.first_order_url ];
            
            page_info.html = html;
            page_info.jq_elements = create_jq_elements( html, page_info.receipt_number, open_parameters.first_order_url );
            
            result_waiting_counter --;
            
            if ( result_waiting_counter <= 0 ) {
                finish();
            }
        }, // end of on_rendering_complete()
        
        on_receive_message = function ( jq_event ) {
            var event = jq_event.originalEvent;
            
            log_debug( '*** on_receive_message: result_waiting_counter=', result_waiting_counter, 'event=', event );
            
            if ( event.origin != get_origin_url() ) {
                log_error( 'origin error:', event.origin );
                return;
            }
            
            var error = event.data.error,
                signin_request = event.data.signin_request,
                request_order_url = event.data.request_order_url,
                page_info = url_to_page_info[ request_order_url ];
            
            if ( ! page_info ) {
                return;
            }
            
            if ( event.data.error ) {
                log_error( event.data.error_message );
                
                if ( event.data.signin_request ) {
                    window.location.repload( true );
                    return;
                }
            }
            
            page_info.html = event.data.html;
            page_info.jq_elements = create_jq_elements( event.data.html, page_info.receipt_number, request_order_url );
            
            result_waiting_counter --;
            
            if ( result_waiting_counter <= 0 ) {
                finish();
            }
            
            request_order_url = remaining_request_order_urls.shift();
            
            if ( ! request_order_url ) {
                return;
            }
            
            current_receipt_number ++;
            
            var child_window = open_child_window( request_order_url, {
                    is_iframe : true,
                    existing_window : page_info.child_window,
                    open_parameters : {
                        first_order_url : open_parameters.first_order_url,
                        request_order_url : request_order_url
                    }
                } );
            
            url_to_page_info[ request_order_url ] = {
                receipt_number : current_receipt_number,
                child_window : child_window
            };
        }, // end of on_receive_message()
        
        finish = function () {
            open_parameters.additional_order_urls.forEach( function ( additional_order_url ) {
                jq_body.append( url_to_page_info[ additional_order_url ].jq_elements );
            } );
            
            loading_dialog.hide();
            
            if ( open_parameters.show_print_dialog ) {
                if ( OPTIONS.OPEN_PRINT_DIALOG_AUTO ) {
                    window.print();
                }
            }
        }; // end of finish()
    
    $( '<style type="text/css"/>' )
        .text( [
            'h2.receipt a {font-size:14px;}',
            '@media print {',
            '  h2.receipt { display: none; }',
            '  hr.receipt { page-break-after: always; margin: 0 0 0 0; padding: 0 0 0 0; height: 0; border: none; visibility: hidden; }',
            '}'
        ].join( '\n' ) )
        .appendTo( $( 'head' ) );
    
    create_jq_header( current_receipt_number, open_parameters.first_order_url ).prependTo( jq_body );
    
    $( window ).on( 'message', on_receive_message );
    
    url_to_page_info[ open_parameters.first_order_url ] = {
        receipt_number : current_receipt_number
    };
    
    for ( request_counter = 0; request_counter < max_request_number; request_counter ++ ) {
        var request_order_url = remaining_request_order_urls.shift();
        
        if ( ! request_order_url ) {
            break;
        }
        
        current_receipt_number ++;
        
        var child_window = open_child_window( request_order_url, {
                is_iframe : true,
                open_parameters : {
                    first_order_url : open_parameters.first_order_url,
                    request_order_url : request_order_url
                }
            } );
        
        url_to_page_info[ request_order_url ] = {
            receipt_number : current_receipt_number,
            child_window : child_window
        };
    }
    
    wait_for_rendering( function ( result ) {
        on_rendering_complete( result.html );
    } );
    
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
