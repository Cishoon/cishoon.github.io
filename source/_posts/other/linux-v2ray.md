---
title: linux-vpn
categories: [备忘]
tags: [Linux]
date: 2025-06-21
---

在linux服务器上装梯子。

<!--more-->

# V2ray

下载对应版本的[v2ray](https://github.com/v2fly/v2ray-core/releases/)。解压到一个文件夹里。包含 `v2ray` `config.json` 等文件。



获取订阅链接，形如：

```
vmess://eyJob3N0IjoiIiwicGF0aCI6Ii92MiIsInRscyI6IiIsInZlcmlmeV9jZXJ0Ijp0cnVlLCJhZGQiOiJ2Y21pYW8uY29tIiwicG9ydCI6IjEwMTM0IiwiYWlkIjoiMSIsIm5ldCI6IndzIiwidHlwZSI6Im5vbmUiLCJ2IjoiMiIsInBzIjoiISHmr4/mrKHkvb/nlKjliY3or7flhYjmm7TmlrDorqLpmIUhISIsImlkIjoiYzY1NWQyODAtNzliYi0zYTBkLTkxMjUtZjQ5ODM2NzIyY2IzIiwiY2xhc3MiOjAsInNlY3VyaXR5IjoiYXV0byIsInNjeSI6ImF1dG8ifQ==
```

用如下python脚本转换为配置文件：

```python
import base64
import json
import os

# 在此处粘贴你的 vmess 链接列表
vmess_links = """
vmess://eyJob3N0IjoiIiwicGF0aCI6Ii92MiIsInRscyI6IiIsInZlcmlmeV9jZXJ0Ijp0cnVlLCJhZGQiOiJ2Y21pYW8uY29tIiwicG9ydCI6IjEwMTM0IiwiYWlkIjoiMSIsIm5ldCI6IndzIiwidHlwZSI6Im5vbmUiLCJ2IjoiMiIsInBzIjoiISHmr4/mrKHkvb/nlKjliY3or7flhYjmm7TmlrDorqLpmIUhISIsImlkIjoiYzY1NWQyODAtNzliYi0zYTBkLTkxMjUtZjQ5ODM2NzIyY2IzIiwiY2xhc3MiOjAsInNlY3VyaXR5IjoiYXV0byIsInNjeSI6ImF1dG8ifQ==
""".strip().splitlines()

# 输出文件保存路径
output_dir = "./vmess_configs"
os.makedirs(output_dir, exist_ok=True)

for i, line in enumerate(vmess_links, 1):
    if not line.startswith("vmess://"):
        continue
    try:
        encoded = line.strip().replace("vmess://", "")
        # 补全 Base64 padding
        padding = '=' * (-len(encoded) % 4)
        decoded = base64.b64decode(encoded + padding).decode("utf-8")
        config = json.loads(decoded)

        # 构造 V2Ray 客户端 config.json
        v2ray_config = {
            "log": {
                "loglevel": "warning"
            },
            "inbounds": [
                {
                    "port": 10808,
                    "listen": "127.0.0.1",
                    "protocol": "socks",
                    "settings": {
                        "udp": True
                    }
                },
                {
                    "port": 10809,
                    "listen": "127.0.0.1",
                    "protocol": "http",
                }
            ],
            "outbounds": [
                {
                    "protocol": "vmess",
                    "settings": {
                        "vnext": [
                            {
                                "address": config.get("add", ""),
                                "port": int(config.get("port", 443)),
                                "users": [
                                    {
                                        "id": config.get("id", ""),
                                        "alterId": int(config.get("aid", 0)),
                                        "security": config.get("security", "auto")
                                    }
                                ]
                            }
                        ]
                    },
                    "streamSettings": {
                        "network": config.get("net", "tcp"),
                        "security": "tls" if config.get("tls") else "none",
                        "tlsSettings": {} if config.get("tls") else None,
                        "wsSettings": {
                            "path": config.get("path", ""),
                            "headers": {
                                "Host": config.get("host", "")
                            }
                        } if config.get("net") == "ws" else None
                    }
                },
                {
                    "protocol": "freedom",
                    "tag": "direct"
                }
            ],
            "routing": {
                "domainStrategy": "IPIfNonMatch",
                "rules": [
                    {
                        "type": "field",
                        "domain": [
                            "geosite:cn"
                        ],
                        "outboundTag": "direct"
                    },
                    {
                        "type": "field",
                        "ip": [
                            "geoip:cn"
                        ],
                        "outboundTag": "direct"
                    }
                ]
            },
            "dns": {
                "servers": [
                    "https+local://dns.alidns.com/dns-query",
                    "https+local://doh.pub/dns-query",
                    "223.5.5.5",
                    "114.114.114.114",
                    "localhost"
                ],
                "queryStrategy": "UseIPv4",
                "disableCache": False
            }
        }

        # 清理空字段
        if v2ray_config["outbounds"][0]["streamSettings"]["wsSettings"] is None:
            v2ray_config["outbounds"][0]["streamSettings"].pop("wsSettings")
        if v2ray_config["outbounds"][0]["streamSettings"]["tlsSettings"] is None:
            v2ray_config["outbounds"][0]["streamSettings"].pop("tlsSettings")

        print(config["ps"], end="")
        # 写入文件
        output_path = os.path.join(output_dir, f"config_{i}.json")
        with open(output_path, "w") as f:
            json.dump(v2ray_config, f, indent=2)
        print(f"[✓] 已生成: {output_path}")

    except Exception as e:
        print(f"[!] 第{i}个链接解析失败：{e}")

```



替换解压得到的 config.json 。



启动 v2ray，默认读取当前目录下的config.json：

```
./v2ray run
```



然后修改 `~/.bashrc` ，增加

```
export http_proxy=http://127.0.0.1:10809
export https_proxy=http://127.0.0.1:10809
```





# Clash(mihomo)

## 有root

https://github.com/nelvko/clash-for-linux-install，一键安装。



## 无root

下载对应版本的 [mihomo](https://github.com/MetaCubeX/mihomo/releases) ，解压、重命名

```
mkdir -p ~/bin
cd ~/bin
wget https://github.com/MetaCubeX/mihomo/releases/latest/download/.......
gzip -d mihomo-linux-amd64-v1.gz
mv mihomo-linux-amd64-v1 mihomo
chmod +x mihomo
```



编辑配置文件，`~/.config/mihomo/config.yaml`：（rules略）

```
port: 10809
allow-lan: false
mode: rule
log-level: info
external-controller: '127.0.0.1:9090'

proxy-providers:
  mysub:
    type: http
    url: "订阅链接"
    interval: 3600
    path: ./proxies/mysub.yaml
    health-check:
      enable: true
      url: http://www.gstatic.com/generate_204
      interval: 600
      
proxy-groups:
  - name: Proxy
    type: select
    use:
      - mysub
    proxies:
      - 自动选择
      - DIRECT

  - name: 自动选择
    type: url-test
    use:
      - mysub
    url: http://www.gstatic.com/generate_204
    interval: 600
    
rules:
    - 'DOMAIN-SUFFIX,mzstatic.com,DIRECT'
    - 'DOMAIN-SUFFIX,akadns.net,DIRECT'
    - 'DOMAIN-SUFFIX,aaplimg.com,DIRECT'
```



启动mihomo

```
mihomo
```



访问 http://yacd.haishan.me 面板用webui设置代理。

服务器上可以先转发端口。

