( function () {

'use strict';

if ( typeof browser == 'undefined' ) { window.browser = chrome; }

function message_handler( message, sender, sendResponse ) {
    var type = message.type,
        response = null;
    
    switch ( type ) {
        case 'PRINT_PREVIEW_REQUEST':
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
    }
    
    sendResponse( response );
    
    return false;
} // end of message_handler()


browser.runtime.onMessage.addListener( message_handler );
    
} )();
