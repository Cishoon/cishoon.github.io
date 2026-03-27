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



# SSH 端口转发（通用方法）

如果本地已经有VPN代理（比如电脑上开着Clash/V2ray），可以通过SSH远程端口转发，把本地的代理端口映射到任意服务器上，不需要在服务器上安装任何代理软件。

```bash
ssh -o ServerAliveInterval=30 -R 7890:127.0.0.1:7890 user@server_ip
```

- `-R 7890:127.0.0.1:7890`：将服务器的 `7890` 端口转发到本地的 `7890` 端口（即本地代理监听的端口）
- `-o ServerAliveInterval=30`：每30秒发送心跳包，防止连接断开
- 本地代理端口号根据实际情况修改，Clash 默认 `7890`，V2ray 默认 `10809`

连接后在服务器上设置环境变量即可使用：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

如果需要后台保持转发（不进入交互式shell）：

```bash
ssh -o ServerAliveInterval=30 -fNT -R 7890:127.0.0.1:7890 user@server_ip
```

- `-f`：后台运行
- `-N`：不执行远程命令
- `-T`：不分配终端

> 在有管理员权限的服务器上我更喜欢配置 Zerotier 和有vpn的机器内网穿透。


# 快捷代理配置命令

将以下内容添加到 `~/.bashrc` 或 `~/.zshrc` 中，即可使用 `proxy on` `proxy off` 快捷开关代理

```bash
proxy() {
    local host_ip="127.0.0.1"
    local proxy_port="7890"

    case "$1" in
        on)
            export http_proxy="http://${host_ip}:${proxy_port}"
            export https_proxy="http://${host_ip}:${proxy_port}"
            export HTTP_PROXY="http://${host_ip}:${proxy_port}"
            export HTTPS_PROXY="http://${host_ip}:${proxy_port}"
            export ALL_PROXY="socks5://${host_ip}:${proxy_port}"
            export no_proxy="localhost,127.0.0.1,localaddress,.localdomain.com,${host_ip}"

            echo -e "\033[32m[OK] Proxy is ON. Connected to ${host_ip}:${proxy_port}\033[0m"
            ;;

        off)
            unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY no_proxy
            echo -e "\033[31m[OK] Proxy is OFF.\033[0m"
            ;;
        ssh)
            local current_user=$(whoami)
            local current_host=$(echo $SSH_CONNECTION | awk '{print $3}')
            local ssh_cmd="ssh -o ServerAliveInterval=30 -fNT -R ${proxy_port}:127.0.0.1:7890 ${current_user}@${current_host}"

            echo -e "\033[36m[Info] 生成的反向隧道命令：\033[0m"
            echo -e "\033[33m$ssh_cmd\033[0m"
            local b64_cmd=$(echo -n "$ssh_cmd" | base64 -w 0 2>/dev/null || echo -n "$ssh_cmd" | base64)
            printf "\033]52;c;%s\a" "$b64_cmd"
            echo -e "\033[32m[Success] 命令已尝试跨端复制到本地电脑剪贴板！\033[0m"
            ;;
        status)
            if [ -n "$http_proxy" ]; then
                echo -e "\033[32m[Status] Proxy is currently ON ($http_proxy)\033[0m"
            else
                echo -e "\033[31m[Status] Proxy is currently OFF\033[0m"
            fi
            ;;

        *)
            echo "Usage: proxy {on|off|status}"
            ;;
    esac
}

proxy on
```