---
title: linux-v2ray
categories: [备忘]
tags: [Linux]
date: 2025-06-21
---

在linux服务器上装梯子。

<!--more-->

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
            "inbounds": [
                {
                    "port": 10808,
                    "listen": "127.0.0.1",
                    "protocol": "socks",
                    "settings": {
                        "udp": True
                    }
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
                }
            ]
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

