## MODIFIED Requirements

### Requirement: Start with a folder and a threshold
脚本 SHALL 在启动时接收一个或多个来源文件夹、一个输出文件夹和一个播放量阈值。阈值 MUST 是大于等于 0 的整数。以下任一情况，脚本 MUST 说明原因并退出，且 MUST NOT 建立清单：某个来源文件夹不存在或不是文件夹；输出文件夹已存在但不是文件夹；输出文件夹位于任一来源文件夹之内；阈值不合法。输出文件夹不存在时，脚本 SHALL 创建它。端口已被占用时，脚本 MUST 说明原因并退出，且 MUST NOT 建立清单。脚本 MUST 只监听 `127.0.0.1` 上的一个端口。脚本 MUST 只在 Windows 10 及以上运行；其他系统上启动时 MUST 说明不支持并退出，且 MUST NOT 建立清单。

#### Scenario: Valid arguments start the watcher
- **WHEN** 用户用两个存在的来源文件夹、一个输出文件夹和阈值 `10000` 启动脚本
- **THEN** 脚本开始监视这两个文件夹，并在输出文件夹建立清单

#### Scenario: Invalid arguments do not create a ledger
- **WHEN** 某个来源文件夹不存在，或阈值是 `-1` 或 `1.2万`
- **THEN** 脚本退出并说明原因，输出文件夹中没有新清单

#### Scenario: The output folder sits inside a source folder
- **WHEN** 输出文件夹位于某个来源文件夹之内
- **THEN** 脚本退出并说明原因，不开始监视

#### Scenario: A non-Windows system is refused
- **WHEN** 在 macOS 或 Linux 上启动脚本
- **THEN** 脚本说明只支持 Windows 并退出，没有建立清单

### Requirement: Watch several source folders in one process
一个脚本进程 SHALL 同时监视全部来源文件夹，并使用同一个端口和同一个阈值。扩展 MUST NOT 感知来源文件夹的数量。任意一个来源文件夹里出现待查文件时，脚本 SHALL 按发现顺序逐部交出。只监视一个来源文件夹时，其余行为 MUST 与监视多个时相同。

#### Scenario: Files from two folders are searched in turn
- **WHEN** 两个来源文件夹先后各出现一个新文件
- **THEN** 脚本按发现顺序先交第一部，得到结果后再交第二部，全程只用一个端口

#### Scenario: One folder is empty
- **WHEN** 其中一个来源文件夹始终没有新文件
- **THEN** 另一个来源文件夹的文件仍照常被搜索

### Requirement: Watch only new regular files
脚本 SHALL 只处理全部来源文件夹这一层在启动之后新出现的普通文件。隐藏文件、子文件夹和符号链接 MUST NOT 被搜索或移动。在 Windows 上，隐藏文件 SHALL 包括带隐藏或系统属性的文件，点开头的名字也算隐藏，`desktop.ini`、`Thumbs.db` 和 `$RECYCLE.BIN` 这类系统项目 MUST NOT 被当成剧名。启动时已经存在的文件，之后即使改名，也 MUST NOT 被搜索。从外面移入或复制进来的文件 SHALL 算作新文件。文件夹内部改名 MUST NOT 算作一部新剧。

#### Scenario: A file copied in after start is watched
- **WHEN** 脚本已经启动，用户把 `冰山学姐沦陷了.mp4` 复制进其中一个来源文件夹
- **THEN** 脚本把这个文件列入待查

#### Scenario: Existing and hidden files are ignored
- **WHEN** 启动时某个来源文件夹里已有 `旧剧.mp4`，之后出现 `.DS_Store`、`desktop.ini`、一个带隐藏属性的文件、一个子文件夹和一条符号链接
- **THEN** 脚本不搜索也不移动这些项目

### Requirement: Search files in discovery order after they stop growing
脚本 SHALL 按文件第一次出现的顺序处理，并把这个顺序写入清单；多个来源文件夹之间也 MUST 使用同一个顺序。轮到的文件大小须连续 2 秒不变后才可交给扩展。它还没稳定时，后面的文件 MUST NOT 插队。稳定前被改名的文件仍算原来那一部，稳定后 MUST 使用新文件名。交给扩展前，脚本 MUST 再次确认文件身份未变且大小与稳定时相同。文件名变了就使用新文件名并保持原顺序。大小又变了就 MUST NOT 交出，等它重新稳定。搜索开始后文件被改名或大小又增加时，本次结果 MUST NOT 使用，文件保持未完成，等再次稳定后重新搜索。

#### Scenario: A download is renamed before it becomes stable
- **WHEN** 文件先以临时名字出现，写入期间改名为 `冰山学姐沦陷了.mp4`，随后大小连续 2 秒不变
- **THEN** 脚本用「冰山学姐沦陷了」搜索这一部，而不是临时名字

#### Scenario: The file grows after search starts
- **WHEN** 搜索已经开始，文件大小又增加
- **THEN** 脚本不根据这次结果移动文件，并在大小再次稳定后重新搜索

#### Scenario: A folder appearing later does not jump the queue
- **WHEN** 第二个来源文件夹里的文件仍在增长，第一个来源文件夹里已经稳定的文件排在它后面出现
- **THEN** 脚本先等前一个文件稳定，不把它越过顺序提前交出

### Requirement: Remember unfinished and finished files
脚本 SHALL 把清单放在输出文件夹里的隐藏文件 `.drama-watch.json`，并把它设为隐藏属性。未完成项 MUST 按发现顺序保存文件身份、来源文件夹和当前路径。文件身份 MUST 使用系统提供的文件编号和创建时间。系统没有提供可用文件编号时，文件身份 SHALL 使用规范化后的完整路径和创建时间。脚本重启后 MUST 按该顺序继续查未完成且仍能按文件身份找回的文件，即使这些文件在本次启动时已经位于来源文件夹中。文件身份找不到时，脚本 MUST 从清单去掉该项并且不搜索。已查完记录 MUST 保留，并区分「未超过阈值」「没有匹配」「搜索失败」「播放量无法解析」「名字为空」和「已移入输出文件夹」。相同文件身份的文件 MUST NOT 再查。文件编号相同但创建时间不同的文件 SHALL 作为新文件再查。读不到创建时间时，已有该身份记录的文件 MUST NOT 再查。

#### Scenario: Restart continues unfinished files
- **WHEN** 一个文件已发现但还没有明确搜索结果，脚本退出后再次启动
- **THEN** 脚本继续处理这个文件，不因为它已经在来源文件夹里而跳过

#### Scenario: A completed file returns from Trash
- **WHEN** 一个已记为「已移入输出文件夹」的文件以相同身份回到某个来源文件夹
- **THEN** 脚本不再搜索它

#### Scenario: A volume without stable file numbers
- **WHEN** 系统没有为某个文件提供可用的文件编号
- **THEN** 脚本用规范化路径和创建时间识别它，不把同路径不同创建时间的文件当成同一个

### Requirement: Allow only one watcher per output folder and per source folder
同一输出文件夹同时 MUST NOT 有两个脚本在监视。任何一个来源文件夹也 MUST NOT 同时被两个脚本监视。清单只表示待查和已查完的文件，MUST NOT 用来判断脚本是否正在运行。脚本崩溃或被停止后，下一个启动 SHALL 能继续未完成项。参数合法时，脚本 MUST 立即建立清单并占用输出文件夹与全部来源文件夹，退出时 MUST 释放这些占用。

#### Scenario: A second script exits
- **WHEN** 一个脚本正在监视某几个文件夹，用户用同一个输出文件夹再次启动脚本
- **THEN** 第二个脚本退出，第一个脚本继续运行

#### Scenario: Two scripts share one source folder
- **WHEN** 两个脚本使用不同的输出文件夹，但其中一个来源文件夹相同
- **THEN** 后启动的脚本退出并说明该文件夹已被监视

### Requirement: Decide from the maximum parseable view count
脚本 SHALL 在扩展返回的匹配播放量原文中取能解析出的最大值。纯数字、带逗号的数字，以及带「次播放」「次观看」或 “views” 的文字都要解析。「约」MUST 被忽略。`万` 和 `萬` MUST 按 10000 计，`亿` 和 `億` MUST 按 1 亿计，`k` MUST 按 1000 计，`m` MUST 按 100 万计。`1.2万` MUST 按 12000 计。最大值大于阈值时，脚本 SHALL 把文件移动到输出文件夹，且 MUST NOT 删除文件。最大值小于或等于阈值时，文件留在原处，并记成「未超过阈值」。至少有一条能解析时，MUST 用这些可解析值中的最大值，不能因为另有一条解析不了而放弃。全部不能解析时，文件留在原处，记成「播放量无法解析」，并且 MUST NOT 自动重试。没有匹配记成「没有匹配」。扩展明确返回的搜索失败，包括超时、验证码和同意页，记成「搜索失败」。这两种已查完状态也 MUST NOT 自动重试。

#### Scenario: Abbreviated views cross the threshold
- **WHEN** 阈值是 `10000`，匹配结果里最大的可解析播放量是 `1.2万`
- **THEN** 脚本把文件移动到输出文件夹，并记下最大播放量 `12000` 和阈值 `10000`

#### Scenario: Views do not cross the threshold
- **WHEN** 阈值是 `10000`，最大可解析播放量是 `4085`
- **THEN** 文件留在原处，并记成「未超过阈值」

#### Scenario: No view text can be parsed
- **WHEN** 扩展返回了匹配视频，但每条播放量都无法按上述规则解析
- **THEN** 文件留在原处，记成「播放量无法解析」，脚本以后不再查它

#### Scenario: The output folder already has a file with that name
- **WHEN** 输出文件夹里已有同名文件
- **THEN** 脚本用带序号的新名字保存这次移入的文件，不覆盖已有文件

#### Scenario: Two source folders contain the same file name
- **WHEN** 两个来源文件夹各有一部同名且都超过阈值的剧
- **THEN** 两部都移入输出文件夹，各自保留一份，不互相覆盖

### Requirement: Retry a failed Trash move without repeating a finished search
移到输出文件夹失败时，文件 MUST 留在原处并保持未完成。文件身份、大小和文件名都没变时，下次 MUST 只重试移动，不再搜索，并继续使用上次已经超过阈值的判定。这三项有任何一项变化时，上次判定作废，脚本 MUST 等文件稳定后重新搜索。连不上扩展，或扩展没有返回播放量、没有匹配、搜索失败这三种明确结果时，文件 MUST 保持未完成，以便以后再查。

#### Scenario: Trash fails and the file is unchanged
- **WHEN** 播放量已经超过阈值，但移到输出文件夹失败，文件身份、大小和文件名都没变
- **THEN** 脚本下次只重试移动，不重新搜索

#### Scenario: The extension is not running
- **WHEN** Chrome 没开或扩展没有响应
- **THEN** 脚本不把这部剧记成搜索失败，文件保持未完成

### Requirement: Print one line when the outcome changes
一部剧的结果变化时，脚本 SHALL 在终端打一行，包含来源文件夹、文件名、结果和原因。「未超过阈值」和「已移入输出文件夹」的原因 MUST 包含最大播放量和阈值。「没有匹配」和「搜索失败」的原因 MUST 包含扩展返回的原因。「稍后再试」MUST 说明是在等文件稳定、在等扩展，还是移动失败。同一部剧的同一种等待 MUST NOT 重复打印，直到结果或等待原因改变。

#### Scenario: The same wait is not printed twice
- **WHEN** 一部剧正在等扩展，扩展连续多次没有取走它
- **THEN** 终端只为这个等待打一行「稍后再试」
