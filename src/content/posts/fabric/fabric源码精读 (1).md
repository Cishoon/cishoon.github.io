---
title: Hyperledger Fabric 源码精读（1）
categories: [笔记]
tags: [go, fabric, 区块链, 超级账本]
date: 2024-09-09
---

- 开坑，学习 Fabric 的源码。

- 思路是根据 `fabric-sample` 的 `test-network` 中的脚本，一行行分析。遇到里面使用的指令，看源码如何实现。

- 下面内容非常混乱，写的毫无逻辑，之后有空重新整理一遍。

- 一口气写完太长了，typora里会卡了，分章节发。

- 学习笔记，不保证内容正确性。

<!--more-->

# 0 文件结构概览

1. ccaas_builder: 包含构建链代码即服务（CCaaS）相关命令的代码。
   
2. ci: 包含持续集成（CI）相关的脚本，用于自动化测试和构建过程。

3. **cmd**: 包含Fabric项目中各种命令行工具的实现代码，如`configtxgen`、`cryptogen`、`peer`等。

4. **common**: 包含Fabric项目中各模块通用的功能模块，如加密、配置、错误处理等。

5. **core**: 实现了Fabric的核心功能，如ACL管理、链代码生命周期、提交人、账本管理、策略管理等。

6. **discovery**: 处理Fabric中的服务发现功能，包括客户端、命令行工具、背书策略等。

7. docs: 文档生成工具及相关资源文件。

8. **gossip**: 包含实现Fabric中gossip协议的相关代码，用于网络节点间的数据传播与共识。

9. images: 包含Fabric各组件的Docker镜像构建文件，如`peer`、`orderer`等。

10. integration: 包含集成测试相关的代码，用于验证Fabric各组件间的相互作用。

11. **internal**: 包含Fabric内部使用的一些模块和工具，如配置生成器、加密工具等。

12. **msp**: 包含成员服务提供者（MSP）相关的代码，用于管理组织的身份和证书。

13. **orderer**: 包含排序服务节点（Orderer）相关的功能模块，如共识机制实现、样例客户端等。

14. pkg: 包含一些通用的包和工具，如状态数据和交易处理相关的代码。

15. protoutil: 包含与Protobuf相关的工具和测试文件。

16. release_notes: 包含项目的发行说明，记录版本更新和变化。

17. sampleconfig: 包含一些样例配置文件，如MSP配置，用于演示和测试。

18. scripts: 包含各种脚本文件，用于辅助项目的构建和部署。

19. swagger: 用于生成Swagger文档的文件，Swagger用于API文档的生成。

20. tools: 包含一些额外的工具和实用程序。

21. vagrant: 包含用于创建虚拟开发环境的Vagrant配置文件。

22. vendor: 包含Fabric项目依赖的第三方库和包。



# 1 networkUp

## 1.1 证书生成与MSP

启动网络首先会执行证书生成。

fabric 提供三种证书生成的工具：`cryptogen` `cfssl` `Fabric CA`。这里先以 `cryptogen` 为例，后续补充 `Fabric CA` 的实现。



### 1.1.1 cryptogen

`cryptogen` 是 fabric 提供的一个命令行工具。

命令帮助：https://hyperledger-fabric.readthedocs.io/zh-cn/latest/commands/cryptogen.html

它为测试提供了一种预配置网络的工具。 通常它**不应使用在生产环境中**。



networkUp中执行如下指令：

```shell
cryptogen generate --config=./organizations/cryptogen/crypto-config-org1.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-org2.yaml --output="organizations"
cryptogen generate --config=./organizations/cryptogen/crypto-config-orderer.yaml --output="organizations"
```

`cryptogen generate` 用于生成秘钥材料。指定两个参数，分别是配置文件和输出目录。

配置文件结构如下：

```yaml
# ---------------------------------------------------------------------------
# "OrdererOrgs" - 管理orderer节点的组织定义
# ---------------------------------------------------------------------------
OrdererOrgs:
  # ---------------------------------------------------------------------------
  # Orderer
  # ---------------------------------------------------------------------------
  - Name: Orderer
    Domain: example.com
    EnableNodeOUs: false

    # ---------------------------------------------------------------------------
    # "Specs" - 完整描述请参见下面的PeerOrgs
    # ---------------------------------------------------------------------------
    Specs:
      - Hostname: orderer

# ---------------------------------------------------------------------------
# "PeerOrgs" - 管理peer节点的组织定义
# ---------------------------------------------------------------------------
PeerOrgs:
  # ---------------------------------------------------------------------------
  # Org1
  # ---------------------------------------------------------------------------
  - Name: Org1
    Domain: org1.example.com
    EnableNodeOUs: false

    # ---------------------------------------------------------------------------
    # "CA"
    # ---------------------------------------------------------------------------
    # 取消注释这个部分以启用这个组织的CA的显式定义。
    # 这个条目是一个Spec。详细信息请参见下面的"Specs"部分。
    # ---------------------------------------------------------------------------
    # CA:
    #    Hostname: ca # 默认为ca.org1.example.com
    #    Country: US
    #    Province: California
    #    Locality: San Francisco
    #    OrganizationalUnit: Hyperledger Fabric
    #    StreetAddress: org的地址 # 默认为nil
    #    PostalCode: org的邮政编码 # 默认为nil

    # ---------------------------------------------------------------------------
    # "Specs"
    # ---------------------------------------------------------------------------
    # 取消注释这个部分以在配置中启用主机的显式定义。
    # 大多数用户会使用下面的Template。
    #
    # Specs是Spec条目的数组。每个Spec条目由两个字段组成：
    #   - Hostname:   (必需) 期望的主机名，不包括域名部分。
    #   - CommonName: (可选) 指定CN的模板或显式覆盖。
    #                 默认情况下，这是一个模板：
    #
    #                              "{{.Hostname}}.{{.Domain}}"
    #
    #                 它的值分别从Spec.Hostname和Org.Domain中获取。
    #   - SANS:       (可选) 指定将在生成的x509中设置的一个或多个主题备用名称。
    #                 接受模板变量{{.Hostname}}, {{.Domain}}, {{.CommonName}}。
    #                 这里提供的IP地址将被正确识别。其他值将被视为DNS名称。
    #                 注意：会为你创建两个隐式条目：
    #                     - {{ .CommonName }}
    #                     - {{ .Hostname }}
    #                 即：SANS里定义的域名也会被指向这个节点，证书会认为这些域名是这个节点的合法别名。
    # ---------------------------------------------------------------------------
    # Specs:
    #   - Hostname: foo # 默认为"foo.org1.example.com"
    #     CommonName: foo27.org5.example.com # 覆盖基于主机名的上面设置的FQDN
    #     SANS:
    #       - "bar.{{.Domain}}"
    #       - "altfoo.{{.Domain}}"
    #       - "{{.Hostname}}.org6.net"
    #       - 172.16.10.31
    #   - Hostname: bar
    #   - Hostname: baz

    # ---------------------------------------------------------------------------
    # "Template"
    # ---------------------------------------------------------------------------
    # 允许从模板中顺序生成一个或多个主机。
    # 默认情况下，这看起来像是从0到Count-1的"peer%d"。
    # 你可以覆盖节点数（Count）、起始索引（Start）或用于构建名称的模板（Hostname）。
    #
    # 注意：Template和Specs不是互斥的。你可以定义这两个部分，系统会为你创建聚合的节点。
    # 注意名称冲突
    # ---------------------------------------------------------------------------
    Template:
      Count: 1
      # Start: 5
      # Hostname: {{.Prefix}}{{.Index}} # 默认
      # SANS:
      #   - "{{.Hostname}}.alt.{{.Domain}}"

    # ---------------------------------------------------------------------------
    # "Users"
    # ---------------------------------------------------------------------------
    # Count: 除Admin外的用户账户数量
    # ---------------------------------------------------------------------------
    Users:
      Count: 1

  # ---------------------------------------------------------------------------
  # Org2: 完整规范请参见"Org1"
  # ---------------------------------------------------------------------------
  - Name: Org2
    Domain: org2.example.com
    EnableNodeOUs: false
    Template:
      Count: 1
    Users:
      Count: 1

```



执行 `cryptogen generate` 会遍历创建所有配置文件中定义的 `Ordered` 和 `Peer` 节点的**组织**。注意这里是组织，一个组织里面可以包含很多个节点。

```go
func generate() {
	config, err := getConfig() // 读取配置文件，反序列化成config
	if err != nil {
		fmt.Printf("Error reading config: %s", err)
		os.Exit(-1)
	}

	for _, orgSpec := range config.PeerOrgs {
		err = renderOrgSpec(&orgSpec, "peer")
		if err != nil {
			fmt.Printf("Error processing peer configuration: %s", err)
			os.Exit(-1)
		}
		generatePeerOrg(*outputDir, orgSpec)
	}

	for _, orgSpec := range config.OrdererOrgs {
		err = renderOrgSpec(&orgSpec, "orderer")
		if err != nil {
			fmt.Printf("Error processing orderer configuration: %s", err)
			os.Exit(-1)
		}
		generateOrdererOrg(*outputDir, orgSpec)
	}
}
```

`renderOrgSpec`：处理配置文件中的`OrgSpec`，完成配置文件中模板的处理。即完整定义一个组织中的所有节点。

```go
func renderOrgSpec(orgSpec *OrgSpec, prefix string) error {
	// 获取配置文件中定义的公钥算法，默认为ECDSA
	publickKeyAlg := getPublicKeyAlg(orgSpec.Template.PublicKeyAlgorithm)

	// 首先处理Template的配置，自动根据模板生成Specs
	for i := 0; i < orgSpec.Template.Count; i++ {
		data := HostnameData{
			Prefix: prefix,
			Index:  i + orgSpec.Template.Start,
			Domain: orgSpec.Domain,
		}

		// 生成完整的域名
		hostname, err := parseTemplateWithDefault(orgSpec.Template.Hostname, defaultHostnameTemplate, data)
		if err != nil {
			return err
		}

		spec := NodeSpec{
			Hostname:           hostname,
			SANS:               orgSpec.Template.SANS,
			PublicKeyAlgorithm: publickKeyAlg,
		}
		orgSpec.Specs = append(orgSpec.Specs, spec)
	}

	// 再处理Specs中显式定义的Specs
	for idx, spec := range orgSpec.Specs {
		err := renderNodeSpec(orgSpec.Domain, &spec)
		if err != nil {
			return err
		}

		orgSpec.Specs[idx] = spec
	}

	// 同样处理CA节点
	if len(orgSpec.CA.Hostname) == 0 {
		orgSpec.CA.Hostname = "ca"
	}
	err := renderNodeSpec(orgSpec.Domain, &orgSpec.CA)
	if err != nil {
		return err
	}

	return nil
}
```

`generatePeerOrg` / `generateOrderedOrg`：Ordered与Peer类似，区别只在于生成的nodeType是PEER还是Ordered

- **生成Signing证书**

- **生成CA证书**

    生成证书的通过调用ca.NewCA方法，给定地址、街道等基本信息和加密算法，自动生成私钥和公钥

    证书的版本是X.509

- **生成验证 MSP**

    `GenerateVerifyingMSP` 函数负责生成 Hyperledger Fabric 中验证 MSP（Membership Service Provider）所需的工件。以下是其功能的简要说明：

    1. **创建文件夹结构**：
       该函数首先通过 `createFolderStructure` 创建所需的文件夹结构：
       ```go
       err := createFolderStructure(baseDir, false)
       ```

    2. **导出 CA 证书**：
       它将签名 CA 和 TLS CA 证书导出到相应的目录：
       ```go
       err = x509Export(filepath.Join(baseDir, "cacerts", x509Filename(signCA.Name)), signCA.SignCert)
       err = x509Export(filepath.Join(baseDir, "tlscacerts", x509Filename(tlsCA.Name)), tlsCA.SignCert)
       ```

    3. **生成 `config.yaml`**：
       如果启用了 `nodeOUs`，则生成 `config.yaml` 文件：
       ```go
       if nodeOUs {
           exportConfig(baseDir, "cacerts/"+x509Filename(signCA.Name), true)
       }
       ```

    4. **创建管理员证书**：
       如果未启用 `nodeOUs`，则为单元测试创建一个临时的管理员证书：
       ```go
       if !nodeOUs {
           ksDir := filepath.Join(baseDir, "keystore")
           err = os.Mkdir(ksDir, 0o755)
           defer os.RemoveAll(ksDir)
           priv, err := csp.GeneratePrivateKey(ksDir, keyAlg)
           _, err = signCA.SignCertificate(
               filepath.Join(baseDir, "admincerts"),
               signCA.Name,
               nil,
               nil,
               getPublicKey(priv),
               x509.KeyUsageDigitalSignature,
               []x509.ExtKeyUsage{},
           )
       }
       ```

    该函数确保所有必要的 MSP 工件都已生成并放置在正确的目录中，从而便于设置 Hyperledger Fabric 中的验证 MSP。

    > MSP 的功能是什么？
    >
    > nodeOUs是什么？

- **生成所有 PEER 节点**

    遍历 `orgSpec.Specs` ，给每一个节点调用 `msp.GenerateLocalMSP` 生成 MSP

    `GenerateLocalMSP` 函数用于生成本地 MSP（Membership Service Provider）身份和 TLS（Transport Layer Security）证书。以下是对该函数的简要解释：

    1. **创建文件夹结构**：
       ```go
       mspDir := filepath.Join(baseDir, "msp")
       tlsDir := filepath.Join(baseDir, "tls")
       err := createFolderStructure(mspDir, true)
       err = os.MkdirAll(tlsDir, 0o755)
       ```
       该部分代码创建 MSP 和 TLS 所需的文件夹结构。

    2. **生成私钥**：
       ```go
       keystore := filepath.Join(mspDir, "keystore")
       priv, err := csp.GeneratePrivateKey(keystore, keyAlg)
       ```
       生成 MSP 的私钥并存储在 `keystore` 文件夹中。

    3. **生成 X509 证书**：
       ```go
       cert, err := signCA.SignCertificate(
           filepath.Join(mspDir, "signcerts"),
           name,
           ous,
           nil,
           getPublicKey(priv),
           x509.KeyUsageDigitalSignature,
           []x509.ExtKeyUsage{},
       )
       ```
       使用签名 CA 生成 X509 证书，并将其存储在 `signcerts` 文件夹中。

    4. **导出 CA 证书**：
       ```go
       err = x509Export(
           filepath.Join(mspDir, "cacerts", x509Filename(signCA.Name)),
           signCA.SignCert,
       )
       err = x509Export(
           filepath.Join(mspDir, "tlscacerts", x509Filename(tlsCA.Name)),
           tlsCA.SignCert,
       )
       ```
       将签名 CA 和 TLS CA 的证书分别导出到 `cacerts` 和 `tlscacerts` 文件夹中。

    5. **生成 config.yaml**：
       ```go
       if nodeOUs {
           exportConfig(mspDir, filepath.Join("cacerts", x509Filename(signCA.Name)), true)
       }
       ```
       如果启用了节点 OU（Organizational Units），则生成 `config.yaml` 配置文件。

    6. **生成 TLS 证书**：
       ```go
       tlsPrivKey, err := csp.GeneratePrivateKey(tlsDir, keyAlg)
       _, err = tlsCA.SignCertificate(
           filepath.Join(tlsDir),
           name,
           nil,
           sans,
           getPublicKey(tlsPrivKey),
           x509.KeyUsageDigitalSignature|x509.KeyUsageKeyEncipherment,
           []x509.ExtKeyUsage{
               x509.ExtKeyUsageServerAuth,
               x509.ExtKeyUsageClientAuth,
           },
       )
       ```
       生成 TLS 私钥和证书，并将其存储在 TLS 文件夹中。

    7. **重命名 TLS 证书**：
       
       ```go
       tlsFilePrefix := "server"
       if nodeType == CLIENT || nodeType == ADMIN {
           tlsFilePrefix = "client"
       }
       err = os.Rename(filepath.Join(tlsDir, x509Filename(name)),
           filepath.Join(tlsDir, tlsFilePrefix+".crt"))
       ```
       根据节点类型重命名生成的 TLS 证书。
       
    8. **导出私钥**：
       ```go
       err = keyExport(tlsDir, filepath.Join(tlsDir, tlsFilePrefix+".key"))
       ```
       将私钥导出到指定文件中。

    该函数的主要目的是生成和配置 MSP 和 TLS 所需的各种证书和密钥文件。

    > `GenerateLocalMSP` 和 `GenerateVerifyingMSP` 函数的主要区别在于它们的用途和生成的内容：
    >
    > 1. **`GenerateLocalMSP`**:
    >    - 主要用于生成本地 MSP（Membership Service Provider）身份工件。
    >    - 创建文件夹结构并生成私钥。
    >    - 使用签名 CA 生成 X509 证书。
    >    - 将签名 CA 证书和 TLS CA 证书分别写入 `cacerts` 和 `tlscacerts` 文件夹。
    >    - 如果启用了节点 OU（Organizational Units），则生成 `config.yaml` 配置文件。
    >    - 生成 TLS 工件，包括私钥和 X509 证书。
    >    - 适用于需要完整 MSP 身份的节点，如客户端、排序节点或对等节点。
    >
    > 2. **`GenerateVerifyingMSP`**:
    >    - 主要用于生成验证 MSP 工件。
    >    - 创建文件夹结构并写入签名 CA 和 TLS CA 证书。
    >    - 如果启用了节点 OU，则生成 `config.yaml` 配置文件。
    >    - 生成一个临时的管理员证书用于单元测试。
    >    - 适用于只需要验证 MSP 身份的场景，不需要生成完整的本地 MSP 身份。
    >
    > 总结：
    > - `GenerateLocalMSP` 生成完整的本地 MSP 身份，包括私钥和证书。
    > - `GenerateVerifyingMSP` 生成用于验证的 MSP 工件，主要包含 CA 证书和配置文件。

- **生成所有用户节点（CLIENT和ADMIN）**

    同上，给每一个节点调用 `msp.GenerateLocalMSP`

- **复制管理员证书到相应的文件夹**



### 1.1.2 MSP

可见上面的 `cryptogen generate` 只干了两件事，生成各种CA证书和生成MSP。

那MSP是什么？这几种类型有什么区别？`LocalMSP` 和 `VerifyingMSP` 有什么区别？`nodeOUs` 的作用是什么？



身份认证机构（Certificate Authorities, CA）通过生成公钥和私钥对来发行身份，这对密钥可以用来证明身份。这个身份需要被网络识别，这时就需要用到会员服务提供者（Membership Service Provider, MSP）。例如，一个节点（peer）使用其私钥对交易进行数字签名或背书。MSP用来检查该节点是否有权背书交易。然后使用节点证书中的公钥来验证附加在交易上的签名是否有效。因此，MSP是允许该身份被网络其他成员信任和识别的机制。

可以将CA比作信用卡提供商，它发行多种可验证的身份。而MSP则决定哪些信用卡提供商在商店被接受。

CA 提供身份，MSP 验证你的身份能不能在我这里用。



在 `fabric-samples` 的 `asset-transfer-basic/application-gateway` 中，上面由 `cryptogen` 生成的 MSP 证书和 CA签名被用作创建身份和签名，与网关建立连接。

可以推测，在初始构建区块链网络时，验证MSP会被作为配置加载到网络里。



在 Hyperledger Fabric 中，`NodeOUs` 是 Membership Service Provider (MSP) 配置的一部分，用于定义和区分网络中不同节点的角色（身份）类型。`OU` 代表 "Organizational Unit"（组织单位），通过配置 `NodeOUs`，你可以明确指定每个节点在网络中的角色，例如是 Peer 节点、Orderer 节点，还是客户端等。

`NodeOUs` 的作用：

1. **角色区分**：通过 `NodeOUs`，可以在网络中区分不同的节点类型。例如，MSP 可以配置哪些证书对应 Peer 节点，哪些证书对应 Orderer 节点。
2. **访问控制**：在 Hyperledger Fabric 中，`NodeOUs` 配置有助于实施更精细的访问控制策略。不同角色的节点可以被赋予不同的权限和职责，从而确保网络的安全性和有效性。
3. **身份验证**：当一个节点加入网络或执行操作时，MSP 会使用 `NodeOUs` 配置来验证该节点的身份，并确保它符合其配置的角色。例如，只有被正确标识为 Orderer 的节点，才能参与共识过程。



MSP 这部分感觉还没有完全理解。因为到这里，才刚刚完成了 MSP 配置文件的创建，具体的验证逻辑等等还在后面。先留个印象，MSP 的作用是验证用户身份的。



## 1.2 docker-compose

至此，test-network 完成了组织的创建。得到的文件（证书和秘钥）都保存在本地的 `organization` 文件夹中。

接下来，就是使用 `docker-compose` 进行网络的创建。

```shell
docker-compose -f compose/compose-test-net.yaml -f compose/docker/docker-compose-test-net.yaml
```

> 在 `docker-compose` 中，你可以使用多个 `-f` 选项来指定多个 YAML 文件。这样做的目的是将这些文件的内容合并起来，以便更灵活地配置和管理 Docker 服务。



### 1.2.1 具体执行内容

具体来说，这个 `docker-compose` 文件启动了一个 Hyperledger Fabric 测试网络，它包括以下组件：

1. **网络和卷配置**

- **Volumes**: 定义了三个卷，用于持久化 `orderer.example.com`、`peer0.org1.example.com` 和 `peer0.org2.example.com` 节点的数据。这些卷确保了即使容器停止或重启，数据仍然可以保留。
- **Networks**: 定义了一个名为 `fabric_test` 的 Docker 网络，所有服务将会连接到这个网络中以便相互通信。

2. **服务（Services）**

- **Orderer 节点：orderer.example.com**

    - **Container Name**: `orderer.example.com`

    - **Image**: 使用了最新版本的 `hyperledger/fabric-orderer` 镜像。
    - **Environment**:
      - 配置了 Fabric 的日志级别为 `INFO`。
      - 配置了 Orderer 的监听地址和端口。
      - 使用 `OrdererMSP` 作为本地 MSP（Membership Service Provider）。
      - 启用了 TLS，并提供了 TLS 的证书和密钥路径。
      - 配置了 Orderer 的管理端口（7053）和操作端口（9443），以及相关的 TLS 设置。

    - **Volumes**: 挂载了组织相关的 MSP 和 TLS 证书目录，及 Orderer 的数据存储目录。

    - **Ports**: 暴露了 Orderer 的主要端口 7050、管理端口 7053、以及操作端口 9443。

    - **Networks**: 连接到 `fabric_test` 网络。
    - **Command**：`orderer`


- **Peer 节点：peer0.org1.example.com**

    - **Container Name**: `peer0.org1.example.com`

    - **Image**: 使用了最新版本的 `hyperledger/fabric-peer` 镜像。
    - **Environment**:
      - 配置了 Fabric 的日志级别为 `INFO`。
      - 启用了 TLS，并提供了 TLS 的证书和密钥路径。
      - 设置了该节点的 ID 为 `peer0.org1.example.com`，并配置了监听地址。
      - 配置了节点的 Gossip 协议启动节点和外部端点地址。
      - 使用 `Org1MSP` 作为本地 MSP。
      - 配置了节点的操作端口（9444）和链码执行超时（300秒）。

    - **Volumes**: 挂载了组织相关的 MSP 和 TLS 证书目录，及节点的数据存储目录。

    - **Ports**: 暴露了 Peer 节点的主要端口 7051、操作端口 9444。

    - **Networks**: 连接到 `fabric_test` 网络。
    - **Command**：`peer node start`


- **Peer 节点：peer0.org2.example.com**
    - 与上面org1的类似


3. **Additional Configuration in the Second Compose File**

在第二个 `docker-compose` 文件中，针对 `peer0.org1.example.com` 和 `peer0.org2.example.com` 这两个节点，增加了一些额外的配置：
- **CORE_VM_ENDPOINT**: 配置了 Docker 守护进程的 Unix 套接字，用于管理容器内的虚拟机。
- **CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE**: 设置了 Docker 网络模式为 `fabric_test`。





### 1.2.2 `fabric-orderer` / `fabric-peer` 镜像

源码仓库中 `fabric/image`  路径下可以找到他们的 Dockerfile。

简而言之，这个 Dockerfile 的设计分为两个阶段：

1. 首先在构建阶段生成所需的二进制文件（包括 `peer`/`orderer` 和 CCaaS 相关组件）
2. 然后在运行时阶段，将这些构建产物打包到一个精简的 Ubuntu 镜像中，并配置好环境变量和默认启动命令



那接下来主要关注的就是 `orderer` 和 `peer` 的具体实现了。根据镜像启动的顺序，先看 `orderer`。



### 1.2.3 peer



### 1.2.4 orderer



暂时理解不了 `peer` 和 `orderer` 是怎么进行网络通信的，先放一放，看看后面干了什么，确定一下这两个指令干的事情的范围



