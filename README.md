アマゾン注文履歴フィルタ (amzOrderHistoryFilter)
================================================

- License: The MIT license  
- Copyright (c) 2018 風柳(furyu)  
- 対象ブラウザ： Google Chrome、Firefox

[アマゾン(Amazon.co.jp)](https://www.amazon.co.jp/) ので、注文履歴を月別表示したり、月別もしくは通年の領収書をまとめて表示・印刷したりできるように補助する拡張機能(アドオン)／スクリプト。


■ インストール方法 
---
### Chrome 拡張機能版  
Google Chrome で、  

> [アマゾン注文履歴フィルタ - Chrome ウェブストア](https://chrome.google.com/webstore/detail/%E3%82%A2%E3%83%9E%E3%82%BE%E3%83%B3%E6%B3%A8%E6%96%87%E5%B1%A5%E6%AD%B4%E3%83%95%E3%82%A3%E3%83%AB%E3%82%BF/jaikhcpoplnhinlglnkmihfdlbamhgig?hl=ja&gl=JP)  

より拡張機能を追加する。  


### Firefox Quantum (WebExtentions) 版  
Firefox Quantum で、  

> [アマゾン注文履歴フィルタ :: Firefox 向けアドオン](https://addons.mozilla.org/ja/firefox/addon/amzorderhistoryfilter/)  

よりアドオンを追加する。  


### ユーザースクリプト版（Greasemonkey / Tampermonkey）
Firefox＋[Tampermonkey](https://addons.mozilla.org/ja/firefox/addon/tampermonkey/)、Google Chrome＋[Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=ja) の環境で、  

> [ アマゾン注文履歴フィルタ (amzOrderHistoryFilter.user.js)](https://github.com/furyutei/amzOrderHistoryFilter/raw/master/src/js/amzOrderHistoryFilter.user.js)  
                                
をクリックし、指示に従ってインストール。  


■ 使い方
---
インストール後、注文履歴を表示して対象となる年を選択すると、対象月を選択するためのプルダウンメニューおよび絞り込み用チェックボックスが表示される。  
対象月と絞り込み条件を選択すると、該当する注文一覧が表示される。  
また、[領収書印刷用画面]ボタンを押すことで別タブが開き、対象となる注文の領収書がまとめて読み込まれる。  

※詳細は[ブログの記事](http://furyu.hatenablog.com/entry/amzOrderHistoryFilter#%E4%BD%BF%E3%81%84%E6%96%B9) を参照のこと。  


■ 外部ライブラリなど
---
- [jQuery](https://jquery.com/)  


■ 関連記事
---
- [【アマゾン注文履歴フィルタ】確定申告にも便利かも？！ Kindle 等のデジタルコンテンツの領収書をまとめて表示する拡張機能／アドオン／ユーザースクリプト - 風柳メモ](http://furyu.hatenablog.com/entry/amzOrderHistoryFilter)  
