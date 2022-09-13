(() => {
// TODO: https://www.amazon.co.jp/gp/css/order-history のページ構造が大幅に変わってしまった模様（2022/09）
// →暫定的に、https://www.amazon.co.jp/gp/your-account/order-history?orderFilter=months-3 にリダイレクト
const
    is_unsupported_order_history_page = () => {
        return /^\/gp\/css\/order-history\/?$/.test(new URL(location.href).pathname);
    }, // end of is_unsupported_order_history_page()
    
    get_supported_order_history_page_top_url = () => {
        return `${new URL(location.href).origin}/gp/your-account/order-history?opt=ab&digitalOrders=1&unifiedOrders=1&returnTo=&__mk_ja_JP=%E3%82%AB%E3%82%BF%E3%82%AB%E3%83%8A&orderFilter=months-3`;
    }; // get_supported_order_history_page_top_url()

if (! is_unsupported_order_history_page()) {
    return;
}

location.replace(get_supported_order_history_page_top_url());
})();
