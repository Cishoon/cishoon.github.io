---
title: vscode-server下载慢
categories: [备忘]
tags: [vscode, cursor]
date: 2025-06-03
---

vscode-server下载特别慢，每次连接服务器都要等很久，配置了 `~/.bashrc` 全局代理也没用。

**原因：**

VSCode Remote SSH 使用的是 **login shell**，所以只会加载 ~/.bash_profile，**不会自动加载 ~/.bashrc**。

如果你只写在 ~/.bashrc，VSCode 就看不到设置的代理变量了。



**解决方案：**

需要在 `~/.bash_profile` 中配置代理：

```bash
echo 'export http_proxy=http://192.168.3.129:21882' >> ~/.bash_profile
echo 'export https_proxy=http://192.168.3.129:21882' >> ~/.bash_profile
```

或者直接加入：

```bash
if [ -f ~/.bashrc ]; then
    source ~/.bashrc
fi
```

<!--more-->
