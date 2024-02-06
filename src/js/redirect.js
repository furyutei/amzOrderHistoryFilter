 /* 2024/02/05現在未使用 */
(() => {
//[TODO]
// - /gp/css/order-history のページ構造が大幅に変わってしまった模様（2022/09）
// - /gp/your-account/order-history/* でも未対応のページ構造の場合があることを確認（2024/01）
// - 新たに /your-orders/orders?timeFilter=* や /gp/legacy/order-history のパターンも確認＆未対応のページ構造（2024/01）
// →暫定的に、https://www.amazon.co.jp/gp/your-account/order-history?orderFilter=* にリダイレクト
// →画面が真っ白になるとの報告あり
//   暫定的に、https://www.amazon.co.jp/gp/legacy/order-history?orderFilter=* にリダイレクトに変更(2024/02/04)
// →現行の注文履歴画面に対応したため、リダイレクトは取りやめ（このスクリプトも実行しないように変更）(2024/02/05)
const
    normalize_order_history_page = (url) => {
        if (! url) {
            url = location.href;
        }
        const
            url_object = new URL(url),
            pathname = url_object.pathname,
            search_param_map = [... url_object.searchParams].reduce((param_map, [name, value])=>(param_map[name] = value, param_map), {}),
            create_order_history_url = (optional_param_list) => {
                const
                    new_search_params = new URLSearchParams([
                        ['opt', 'ab'],
                        ['digitalOrders', '1'],
                        ['unifiedOrders', '1'],
                        ['orderFilter', 'months-3'],
                        //['returnTo', ''],
                        //['__mk_ja_JP', 'カタカナ'],
                    ]);
                (optional_param_list ?? []).map(([name, value]) => new_search_params.set(name, value));
                return new URL(`/gp/legacy/order-history?${new_search_params.toString()}`, url).href;
            };
        if (new RegExp('^/gp/css/order-history/?$').test(pathname)) {
            return create_order_history_url();
        }
        if (new RegExp('^/gp/(?:legacy|your-account)/order-history(?:/|$)').test(pathname)) {
            const
                ref = (pathname.match('/ref=([^/]*)$') ?? [])[1];
            if (ref) {
                if (ref == 'ppx_yo_dt_b_orders') {
                    return url;
                }
                if (ref == 'ppx_yo_dt_b_yo_link') {
                    return create_order_history_url();
                }
                return null; // TODO: refがあってかつ'ppx_yo_dt_b_orders'/'ppx_yo_dt_b_yo_link'以外ならおそらく注文履歴ではないと思われるが、確証はない
            }
            if (search_param_map['search']) {
                // 注文履歴検索ページは/ref=ppx_yo_dt_b_searchがつくと思われるが、念のためsearchパラメータがある場合もチェック
                return null;
            }
            const
                orderFilter = search_param_map['orderFilter'];
            if (! orderFilter) {
                return create_order_history_url();
            }
            if (/^(?:last\d+|months-\d+|year-\d+)$/.test(orderFilter)) {
                return url.replace('/your-account/', '/legacy/');
            }
            return null;
        }
        if (new RegExp('^/your-orders/orders/?$').test(pathname)) {
            const
                orderFilter = search_param_map['timeFilter'] ?? 'months-3';
            return create_order_history_url([
                ['orderFilter', orderFilter],
            ]);
        }
        return null;
    };

const
    current_url = location.href,
    normalized_order_history_page_url = normalize_order_history_page(current_url);

if ((! normalized_order_history_page_url) || (normalized_order_history_page_url == current_url)) {
    return;
}
location.replace(normalized_order_history_page_url);
})();
