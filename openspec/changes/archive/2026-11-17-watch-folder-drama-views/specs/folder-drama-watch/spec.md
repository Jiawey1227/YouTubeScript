## Purpose

监视一个文件夹里新出现的文件，用扩展返回的播放量原文决定是否把文件移到系统废纸篓，并留下可区分的查完记录。

## ADDED Requirements

### Requirement: Start with a folder and a threshold
脚本 SHALL 在启动时接收监视文件夹路径和播放量阈值。阈值 MUST 是大于等于 0 的整数。文件夹不存在、路径不是文件夹，或阈值不合法时，脚本 MUST 说明原因并退出，且 MUST NOT 建立清单。端口已被占用时，脚本 MUST 说明原因并退出，且 MUST NOT 建立清单。脚本 MUST 只监听 `127.0.0.1`。

#### Scenario: Valid arguments start the watcher
- **WHEN** 用户用一个存在的文件夹和阈值 `10000` 启动脚本
- **THEN** 脚本开始监视该文件夹，并建立清单

#### Scenario: Invalid arguments do not create a ledger
- **WHEN** 文件夹不存在，或阈值是 `-1` 或 `1.2万`
- **THEN** 脚本退出并说明原因，文件夹中没有新清单

### Requirement: Watch only new regular files
脚本 SHALL 只处理监视文件夹这一层在启动之后新出现的普通文件。隐藏文件、子文件夹和符号链接 MUST NOT 被搜索或移动。启动时已经存在的文件，之后即使改名，也 MUST NOT 被搜索。从外面移入或复制进来的文件 SHALL 算作新文件。文件夹内部改名 MUST NOT 算作一部新剧。

#### Scenario: A file copied in after start is watched
- **WHEN** 脚本已经启动，用户把 `冰山学姐沦陷了.mp4` 复制进监视文件夹
- **THEN** 脚本把这个文件列入待查

#### Scenario: Existing and hidden files are ignored
- **WHEN** 启动时文件夹里已有 `旧剧.mp4`，之后出现 `.DS_Store`、一个子文件夹和一条符号链接
- **THEN** 脚本不搜索也不移动这些项目

### Requirement: Derive the drama name from the file name
脚本 SHALL 只用文件名去掉最后一个扩展名、再去掉首尾空白后的文字作为剧名。中间的空白和其余段落 MUST 保留。去掉之后没有文字时，脚本 MUST NOT 打开搜索，文件留在原处，并记成「名字为空」。

#### Scenario: Only the last extension is removed
- **WHEN** 新文件名为 `冰山学姐沦陷了.backup.mp4`
- **THEN** 脚本交给扩展的剧名是 `冰山学姐沦陷了.backup`

#### Scenario: An empty stem is finished without search
- **WHEN** 新文件去掉扩展名和首尾空白后没有文字
- **THEN** 脚本不请求搜索，文件留在原处，并记成「名字为空」

### Requirement: Search files in discovery order after they stop growing
脚本 SHALL 按文件第一次出现的顺序处理，并把这个顺序写入清单。轮到的文件大小须连续 2 秒不变后才可交给扩展。它还没稳定时，后面的文件 MUST NOT 插队。稳定前被改名的文件仍算原来那一部，稳定后 MUST 使用新文件名。交给扩展前，脚本 MUST 再次确认 inode 未变且大小与稳定时相同。文件名变了就使用新文件名并保持原顺序。大小又变了就 MUST NOT 交出，等它重新稳定。搜索开始后文件被改名或大小又增加时，本次结果 MUST NOT 使用，文件保持未完成，等再次稳定后重新搜索。

#### Scenario: A download is renamed before it becomes stable
- **WHEN** 文件先以临时名字出现，写入期间改名为 `冰山学姐沦陷了.mp4`，随后大小连续 2 秒不变
- **THEN** 脚本用「冰山学姐沦陷了」搜索这一部，而不是临时名字

#### Scenario: The file grows after search starts
- **WHEN** 搜索已经开始，文件大小又增加
- **THEN** 脚本不根据这次结果移动文件，并在大小再次稳定后重新搜索

### Requirement: Remember unfinished and finished files
脚本 SHALL 把清单放在监视文件夹里的隐藏文件 `.drama-watch.json`。未完成项 MUST 按发现顺序保存 inode、创建时间和当前路径。脚本重启后 MUST 按该顺序继续查未完成且仍能按 inode 与创建时间找回的文件，即使这些文件在本次启动时已经位于文件夹中。inode 找不到时，脚本 MUST 从清单去掉该项并且不搜索。已查完记录 MUST 保留，并区分「未超过阈值」「没有匹配」「搜索失败」「播放量无法解析」「名字为空」和「移入废纸篓」。同一 inode 且同一创建时间的文件 MUST NOT 再查。inode 相同但创建时间不同的文件 SHALL 作为新文件再查。读不到创建时间时，已有该 inode 记录的文件 MUST NOT 再查。

#### Scenario: Restart continues unfinished files
- **WHEN** 一个文件已发现但还没有明确搜索结果，脚本退出后再次启动
- **THEN** 脚本继续处理这个文件，不因为它已经在文件夹里而跳过

#### Scenario: A completed file returns from Trash
- **WHEN** 一个已记为「移入废纸篓」的文件以相同 inode 和创建时间回到监视文件夹
- **THEN** 脚本不再搜索它

### Requirement: Allow only one watcher for a folder
同一文件夹同时 MUST NOT 有两个脚本在监视。清单只表示待查和已查完的文件，MUST NOT 用来判断脚本是否正在运行。脚本崩溃或被停止后，下一个启动 SHALL 能继续未完成项。参数合法时，脚本 MUST 立即建立清单并占用该文件夹。

#### Scenario: A second script exits
- **WHEN** 一个脚本正在监视某文件夹，用户对同一文件夹再次启动脚本
- **THEN** 第二个脚本退出，第一个脚本继续运行

### Requirement: Decide from the maximum parseable view count
脚本 SHALL 在扩展返回的匹配播放量原文中取能解析出的最大值。纯数字、带逗号的数字，以及带「次播放」「次观看」或 “views” 的文字都要解析。「约」MUST 被忽略。`万` 和 `萬` MUST 按 10000 计，`亿` 和 `億` MUST 按 1 亿计，`k` MUST 按 1000 计，`m` MUST 按 100 万计。`1.2万` MUST 按 12000 计。最大值大于阈值时，脚本 SHALL 把文件移到系统废纸篓。最大值小于或等于阈值时，文件留在原处，并记成「未超过阈值」。至少有一条能解析时，MUST 用这些可解析值中的最大值，不能因为另有一条解析不了而放弃。全部不能解析时，文件留在原处，记成「播放量无法解析」，并且 MUST NOT 自动重试。没有匹配记成「没有匹配」。扩展明确返回的搜索失败，包括超时、验证码和同意页，记成「搜索失败」。这两种已查完状态也 MUST NOT 自动重试。

#### Scenario: Abbreviated views cross the threshold
- **WHEN** 阈值是 `10000`，匹配结果里最大的可解析播放量是 `1.2万`
- **THEN** 脚本把文件移到系统废纸篓，并记下最大播放量 `12000` 和阈值 `10000`

#### Scenario: Views do not cross the threshold
- **WHEN** 阈值是 `10000`，最大可解析播放量是 `4085`
- **THEN** 文件留在原处，并记成「未超过阈值」

#### Scenario: No view text can be parsed
- **WHEN** 扩展返回了匹配视频，但每条播放量都无法按上述规则解析
- **THEN** 文件留在原处，记成「播放量无法解析」，脚本以后不再查它

### Requirement: Retry a failed Trash move without repeating a finished search
移到废纸篓失败时，文件 MUST 留在原处并保持未完成。inode、大小和文件名都没变时，下次 MUST 只重试移动，不再搜索，并继续使用上次已经超过阈值的判定。这三项有任何一项变化时，上次判定作废，脚本 MUST 等文件稳定后重新搜索。连不上扩展，或扩展没有返回播放量、没有匹配、搜索失败这三种明确结果时，文件 MUST 保持未完成，以便以后再查。

#### Scenario: Trash fails and the file is unchanged
- **WHEN** 播放量已经超过阈值，但移到废纸篓失败，文件的 inode、大小和文件名都没变
- **THEN** 脚本下次只重试移动，不重新搜索

#### Scenario: The extension is not running
- **WHEN** Chrome 没开或扩展没有响应
- **THEN** 脚本不把这部剧记成搜索失败，文件保持未完成

### Requirement: Print one line when the outcome changes
一部剧的结果变化时，脚本 SHALL 在终端打一行，包含文件名、结果和原因。「未超过阈值」和「移入废纸篓」的原因 MUST 包含最大播放量和阈值。「没有匹配」和「搜索失败」的原因 MUST 包含扩展返回的原因。「稍后再试」MUST 说明是在等文件稳定、在等扩展，还是废纸篓失败。同一部剧的同一种等待 MUST NOT 重复打印，直到结果或等待原因改变。

#### Scenario: The same wait is not printed twice
- **WHEN** 一部剧正在等扩展，扩展连续多次没有取走它
- **THEN** 终端只为这个等待打一行「稍后再试」
