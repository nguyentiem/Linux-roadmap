# Bài 36 — Container, namespace và cgroups v2

[Mục lục](../README.md) · [← Bài 35](35-dong-thoi-va-khoa.md) · [Bài 37 →](37-virtualization.md)

## Mục tiêu: tách ba câu hỏi “nhìn thấy gì, dùng bao nhiêu, được làm gì?”

Một container nhìn thấy PID 1 của riêng nó nhưng vẫn dùng kernel máy ngoài. Nó có thể bị giới hạn nửa thời gian một CPU dù host còn nhiều CPU rảnh; có thể OOM trong nhóm dù host còn RAM. Ngược lại, tạo namespace mới không tự đặt bất kỳ quota CPU/RAM nào.

Nên đã học bài 15, 19, 26, 32. Sau bài này, bạn cần phân biệt namespace với cgroup và quyền; đọc cgroup v2/giới hạn cha; giải thích quota so với weight; nhận diện rootfs/layer/dữ liệu cần giữ; biết phạm vi bảo vệ của rootless và syscall filtering.

Phần chính chỉ quan sát namespace/cgroup hiện có và đọc ví dụ. Các lab tạo service/namespace chỉ thực hiện trên **VM lab dùng riêng** có systemd/cgroups v2 và quyền phù hợp, không thay cgroup/mount/sysctl host đang làm việc. Không cần cài container engine, không cố gây OOM và không chạy container đặc quyền để bỏ qua hạn chế.

## 1. Container là máy ảo có một kernel nhỏ hơn không?

**Process — tiến trình** là một lần chương trình đang chạy, có tài nguyên và mã **PID**. **Thread — luồng thực thi** là một dòng công việc trong process, được kernel lập lịch. **Kernel — nhân hệ điều hành** quản lý CPU, bộ nhớ, thiết bị và quyền. **Host — hệ thống bên ngoài chứa môi trường đang xét** là nơi kernel phục vụ các process container.

**Container — môi trường process được tổ chức/cách ly bằng cơ chế hệ điều hành** thường là tổ hợp nhiều tính năng, không phải một syscall duy nhất. **Namespace — phạm vi nhìn và quản lý một loại tài nguyên** có thể cho process thấy tập PID/interface/mount riêng. **Cgroup — control group, nhóm kiểm soát tài nguyên** gom task để đo và điều khiển mức dùng. **Privilege — đặc quyền** quyết định có được thực hiện thao tác quản trị hay không; tầm nhìn riêng không tự loại bỏ mọi đặc quyền hoặc tạo mọi giới hạn.

**VM — máy ảo** mô phỏng/ảo hóa một máy để hệ điều hành khách thông thường chạy kernel riêng. Container Linux thông thường chia sẻ kernel đang phục vụ môi trường host Linux liên quan. Nếu engine chạy trong một Linux VM trên desktop hệ điều hành khác, kernel được chia sẻ là kernel của VM Linux đó, không suy container Linux dùng trực tiếp kernel macOS/Windows. Bài 37 sẽ giải thích lớp VM kỹ hơn.

```text
Ứng dụng container A        Ứng dụng container B        Ứng dụng host
       |                           |                         |
  tầm nhìn namespace          tầm nhìn namespace             |
  cgroup/giới hạn              cgroup/giới hạn                 |
       +---------------------------+-------------------------+
                                   |
                         Cùng kernel Linux liên quan
                                   |
                        CPU / RAM / thiết bị / lưu trữ
```

Đọc xuống: mỗi nhóm có cách nhìn và ràng buộc khác, nhưng cùng nhờ kernel quản lý phần cứng. Các lớp giữa không tạo kernel độc lập. Không container nào tự được bảo đảm dùng ít RAM chỉ vì có tên/image riêng.

## 2. Mỗi namespace thay đổi điều gì, và điều gì vẫn có thể chung?

Bảng sau phân loại trách nhiệm. **Interface** là giao diện gửi/nhận mạng, **route** là đường đi packet, **socket** là đầu giao tiếp ứng dụng; có riêng các đối tượng này khác với chỉ đặt một hostname khác.

| Loại namespace | Phạm vi được tách | Ví dụ và giới hạn |
|---|---|---|
| PID | Cách nhìn/đánh số process | Một process có PID khác bên trong/bên ngoài; không tự hạn chế CPU |
| Mount | Tập điểm gắn filesystem | Mount mới có thể chỉ hiện bên trong; dữ liệu file bên dưới vẫn có thể dùng chung |
| Network | Interface, route, socket và trạng thái mạng liên quan | Loopback của hai namespace khác không mặc định cùng server |
| UTS | Hostname và thông tin UTS liên quan | Đổi tên hiển thị không tự đổi IP/DNS |
| User | Ánh xạ UID/GID và phạm vi nhiều quyền liên quan | UID 0 bên trong chưa chắc UID 0 ngoài host |
| IPC | Một số đối tượng giao tiếp liên tiến trình | Không đồng nghĩa mọi file hoặc kênh giao tiếp đều cách ly |
| Cgroup | Cách nhìn gốc/đường dẫn cây cgroup | Không tự bỏ giới hạn cgroup từ tổ tiên |

**Filesystem — hệ thống tệp** tổ chức tên/thư mục/dữ liệu; **mount — gắn filesystem vào cây thư mục** cho phép truy cập qua **mount point — thư mục điểm gắn**, ví dụ `/data`. **Mount namespace** tách góc nhìn các điểm gắn, không tự sao chép mọi byte file. Hai namespace cùng tham chiếu dữ liệu bên dưới vẫn có thể thấy thay đổi file, dù danh sách mount khác nhau. **IPC — giao tiếp giữa process** có nhiều hình thức, namespace IPC chỉ bao phủ các loại được định nghĩa. Nguồn: [namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html), [mount_namespaces(7)](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html).

**UID/GID** là mã số tài khoản/nhóm. **User namespace mapping — ánh xạ mã số** nối một khoảng UID/GID trong namespace với danh tính bên ngoài. **Root** là UID 0 trong phạm vi đang xét; nó có thể ánh xạ ra UID thường ngoài host. Không suy từ `id` bên trong in root ra “được sửa mọi file host”; quyền trên đối tượng cụ thể còn tùy ánh xạ, mount và chính sách. Xem [user_namespaces(7)](https://man7.org/linux/man-pages/man7/user_namespaces.7.html).

Với PID namespace mới, process đầu tiên bên trong có vai trò **init/PID 1**, cần nhận/thu hồi con và có quy tắc signal riêng. **Signal — tín hiệu** báo sự kiện/điều khiển process; xử lý ở PID 1 không luôn giống một process thường. **Reap — thu hồi kết quả con đã chết** dùng họ wait phù hợp; không có reaper tốt có thể để lại zombie — bản ghi con đã kết thúc chưa thu hồi. Muốn `ps` bên trong phản ánh namespace mới, cần `/proc` được mount cho phạm vi PID tương ứng. **`/proc`** là cây thông tin process/kernel, không phải kho dữ liệu thường trên ổ. Xem [pid_namespaces(7)](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html).

## 3. Runtime còn phải làm gì ngoài tạo namespace?

**Container runtime — phần mềm dựng/chạy và quản lý vòng đời container** phối hợp namespace, filesystem, cgroup và quyền theo cấu hình. **Rootfs — cây filesystem gốc của môi trường** cung cấp `/bin`, `/etc`, thư viện và dữ liệu nền cho ứng dụng. **Image — mẫu filesystem/cấu hình dùng tạo môi trường** khác instance — một lần môi trường đã được tạo/chạy — và khác dữ liệu ngoài image.

**Capability — đặc quyền Linux được chia nhỏ** cho phép một nhóm thao tác thay vì toàn quyền quản trị. **Seccomp — bộ lọc lời gọi hệ thống** hạn chế syscall — yêu cầu ứng dụng gửi kernel — theo policy, tức chính sách. Nó không tự phân biệt mọi đường dẫn file theo ý nghĩa ứng dụng, cũng không thay namespace/cgroup. **MAC — kiểm soát truy cập bắt buộc** như SELinux/AppArmor ràng buộc thêm theo nhãn/profile của mô hình tương ứng, khác địa chỉ MAC mạng. Xem [seccomp của kernel](https://docs.kernel.org/userspace-api/seccomp_filter.html), [cấu hình Linux OCI runtime spec](https://github.com/opencontainers/runtime-spec/blob/main/config-linux.md).

**Rootless — chạy runtime/container theo thiết kế không cần daemon root toàn host** thường dùng user namespace và cơ chế hỗ trợ. Nó giảm một số phạm vi đặc quyền nhưng không có nghĩa an toàn vô điều kiện: dữ liệu host được bind vào, quyền mạng, kernel chung và tài nguyên được cấp vẫn cần xem. **Bind mount — gắn một cây/đối tượng có sẵn vào vị trí khác** có thể làm file host hiện trong container; nếu cấp quyền ghi phù hợp, process bên trong có thể sửa dữ liệu đó. Xem [Docker rootless mode](https://docs.docker.com/engine/security/rootless/).

Không dùng `--privileged`, thêm mọi capability hoặc tắt seccomp/MAC chỉ để một lab hết lỗi. Điều đó làm thay tiền đề bảo vệ, không chứng minh cơ chế đã được cấu hình đúng. Lab bài này không cần runtime Docker/Podman để hiểu các lớp.

## 4. Cgroups v2 tổ chức tài nguyên theo cây ra sao?

**Cgroups v2 — phiên bản giao diện kiểm soát nhóm thứ hai** dùng cây thống nhất cho các **controller — bộ điều khiển một loại tài nguyên**, như CPU hoặc memory. **Accounting — ghi nhận lượng dùng** khác **limit — giới hạn**: đọc được usage không chứng minh đã có trần. Task thuộc nhóm; quyền/tính năng controller và cấu trúc cây quyết định file nào có và thao tác nào được phép.

```text
Cgroup cha: có ngân sách/giới hạn chung
    ├── Nhóm A: giới hạn riêng, một số process
    └── Nhóm B: giới hạn riêng, một số process

Con chịu ràng buộc của chính nó + các tổ tiên liên quan
```

Đọc từ trên xuống: không thể suy `memory.max` của A là `max` nên A không có giới hạn nào. Nhóm cha có thể giới hạn tổng A+B. Cgroup namespace có thể giấu một phần đường dẫn bên ngoài nhưng không làm mất hạn mức đó.

**Delegation — ủy quyền quản lý một nhánh** cho runtime/user quản lý phần cây được giao theo quy tắc. Khi systemd/runtime sở hữu nhánh, không `mkdir`/ghi `cpu.max` thủ công rồi cạnh tranh với manager; dùng giao diện của chủ quản hoặc delegation đúng. Systemd là bộ quản lý service trên hệ sử dụng nó; service/unit — đối tượng mô tả/chạy công việc — được manager gắn nhóm tài nguyên phù hợp. Nguồn: [cgroup v2 của kernel](https://docs.kernel.org/admin-guide/cgroup-v2.html).

### 4.1. CPU quota khác weight và affinity thế nào?

**Quota — ngân sách** hạn chế thời gian CPU được dùng trong mỗi **period — kỳ ngân sách**. `cpu.max` thường có hai trường: `MAX PERIOD`, đơn vị microsecond — một phần triệu giây. Ví dụ **minh họa** `50000 100000` là tối đa khoảng 50 ms CPU trong kỳ 100 ms, tương đương nửa thời gian một CPU. Nhiều thread chạy trên nhiều CPU có thể tiêu ngân sách tổng nhanh hơn rồi bị **throttling — tạm ngừng được chạy do hết ngân sách**; không phải mỗi CPU đều còn một nửa quota riêng.

`max 100000` không đặt trần tại nhóm đó, nhưng tổ tiên/điều kiện khác vẫn ràng buộc. **Burst — phần ngân sách bùng thêm** nếu cấu hình hỗ trợ và được đặt có thể ảnh hưởng diễn giải từng kỳ; lab không thêm burst. Xem [CPU bandwidth control](https://docs.kernel.org/scheduler/sched-bwc.html).

**Weight — trọng số chia tương đối** như `cpu.weight` ảnh hưởng phân chia khi nhóm cạnh tranh CPU, không là tỷ lệ cố định toàn máy. Hai nhóm có weight 100/200 có thể chia theo tương quan khi cùng đủ việc trên tài nguyên liên quan; nếu bên kia nhàn, nhóm có thể dùng phần rảnh trong giới hạn khác. **Affinity — tập CPU được phép chạy** chọn vị trí, không tự là quota; `cpuset` cũng kiểm soát phạm vi CPU/bộ nhớ phù hợp theo controller.

Systemd `CPUQuota=50%` nghĩa khoảng nửa thời gian một CPU, **không phải nửa tất cả CPU máy**. `CPUWeight` là trọng số, `AllowedCPUs` là tập cho phép khi hỗ trợ; không thay thế ba câu hỏi bằng một số `%`. Xem [tài liệu systemd resource-control](https://github.com/systemd/systemd/blob/main/man/systemd.resource-control.xml).

### 4.2. Memory high khác memory max và RAM host ra sao?

**RAM** là bộ nhớ vật lý làm việc. **Reclaim — thu hồi trang bộ nhớ** tìm phần có thể lấy lại cho nhu cầu mới. `memory.high` tạo áp lực reclaim/throttling khi vượt ngưỡng phù hợp; nó không là “vượt một byte thì tự kill”. `memory.max` là giới hạn cứng theo cơ chế memory controller, có thể dẫn tới reclaim và OOM khi không đáp ứng được trong phạm vi nhóm.

**OOM — thiếu khả năng đáp ứng nhu cầu bộ nhớ**, và **OOM killer** có thể dừng process theo cơ chế để lấy lại tài nguyên. Host còn RAM không loại trừ OOM trong cgroup; trần cha còn có thể bị chạm bởi tổng các con. `memory.current` là lượng bộ nhớ được tính cho nhóm, không đơn giản là RSS của một process. **RSS — lượng trang process đang resident, tức hiện diện trong RAM** còn có phần chia sẻ và cách tính khác accounting nhóm.

`memory.events` có bộ đếm như `high`, `max`, `oom`, `oom_kill`, cần so trước/sau và biết phạm vi; một `oom_kill` cũ không chứng minh lỗi vừa xảy ra. Bài không thử tăng bộ nhớ cho đến OOM và không đổi `memory.max`/swap của host. Xem phần memory controller trong [tài liệu cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html).

## 5. Lab 1: đọc tầm nhìn và cgroup hiện tại, không sửa host

**Terminal — cửa sổ giao tiếp văn bản** cho nhập lệnh; **shell — chương trình diễn giải lệnh**, lab dùng Bash. Trong terminal thường:

```bash
uname -r
cat /etc/os-release
ls -l "/proc/$$/ns"
cat "/proc/$$/cgroup"
findmnt -t cgroup2
stat -fc %T /sys/fs/cgroup
```

`$$` là PID Bash trong ngữ cảnh terminal thông thường. `uname -r` cho kernel đang chạy; `/etc/os-release` mô tả user space/distro — bộ hệ thống phân phối — hiện thấy, không là kernel riêng. `ls -l /proc/PID/ns` có các tham chiếu dạng `pid:[SO]`, `mnt:[SO]`; **symlink — liên kết** ở đây là giao diện kernel đến đối tượng namespace. Số khác giữa hai process cho loại namespace đó gợi ý khác phạm vi, không là số lượng process/địa chỉ thật.

`cat .../cgroup` trên v2 có thể có dòng `0::/user.slice/...`; đường dẫn tương đối với cách cgroup được trình bày. `findmnt` xem điểm gắn, `stat -f` xem loại filesystem tại đường dẫn; `cgroup2fs` xác nhận filesystem v2 **ở đó**, không bảo đảm mọi controller đã bật/quyền quản lý đã có. Máy cgroup v1/hybrid hoặc namespace che mount có thể khác; không ép đổi boot host để khớp bài.

Nếu muốn đọc nhóm của Bash trên máy v2 có **đúng cây thống nhất gắn ở `/sys/fs/cgroup` và không bị đổi góc nhìn đường dẫn**, lấy đường dẫn rồi xác nhận nó tồn tại:

```bash
current_group=$(awk -F: '$1 == "0" {print $3}' "/proc/$$/cgroup")
printf 'current group: <%s>\n' "$current_group"
```

**`awk`** xử lý văn bản từng dòng; `-F:` tách trường bằng `:`, `$3` lấy đường dẫn. Chỉ đọc `/sys/fs/cgroup$current_group/FILE` sau khi xác nhận giá trị bắt đầu `/`, thư mục đúng và file có. Trong container bị thay root/cgroup mount, ghép đường dẫn kiểu này có thể không đúng; đối chiếu mount/namespace/runtime thay vì diễn giải file nhóm gốc thành service. Xem [cgroup_namespaces(7)](https://man7.org/linux/man-pages/man7/cgroup_namespaces.7.html).

Có thể đọc `cpu.max`, `cpu.stat`, `memory.current`, `memory.high`, `memory.max`, `memory.events`, `cgroup.controllers` của nhóm đúng nếu có/quyền cho phép. `cgroup.controllers` và `cgroup.subtree_control` liên quan controller khả dụng/bật cho cây, không trực tiếp cho biết CPU đang bị throttle. Giá trị chưa đặt trong nhóm con không loại trừ giới hạn tổ tiên.

## 6. Lab 2 chỉ trong VM: quota CPU bằng transient service

### 6.1. Điều kiện và tác động

Dùng VM riêng có console — kênh điều khiển trực tiếp khi truy cập từ xa lỗi — systemd đang làm manager hệ thống, cgroups v2 và controller CPU được hỗ trợ. Cần Python 3, quyền quản trị VM. **Transient service — service tạm tạo qua giao diện manager** không cần viết unit lâu dài; nó vẫn là thay đổi đang chạy trong VM, không thực hiện trên host chỉ để học.

Lab chạy một process dùng CPU trong tối đa 15 giây và đặt quota 50%. Không sửa cây cgroup bằng tay, không đụng service khác. Trước khi chạy xác nhận tên `linux-cpu-lab` chưa có công việc của bạn/người khác; nếu đã tồn tại, chọn tên mới ở **mọi** lệnh. Xác nhận `/usr/bin/python3` là đường dẫn thật bằng `command -v python3`.

```bash
sudo systemd-run --unit=linux-cpu-lab \
  -p CPUQuota=50% -p RuntimeMaxSec=15s \
  /usr/bin/python3 -c 'while True: pass'
systemctl show linux-cpu-lab -p MainPID -p ActiveState -p ControlGroup -p CPUQuotaPerSecUSec
```

`systemd-run` yêu cầu manager tạo service và trả thông tin; lời báo đã tạo không thay kiểm tra process/cgroup thực. `RuntimeMaxSec` giới hạn thời gian hoạt động trước khi manager dừng theo cơ chế timeout. Source: [systemd-run](https://github.com/systemd/systemd/blob/main/man/systemd-run.xml).

### 6.2. Lấy đúng nhóm khi service còn sống

Trong cùng khoảng 15 giây:

```bash
lab_cgroup=$(systemctl show linux-cpu-lab -p ControlGroup --value)
if [[ "$lab_cgroup" == /* && "$lab_cgroup" != / && -d "/sys/fs/cgroup$lab_cgroup" ]]; then
    cat "/sys/fs/cgroup$lab_cgroup/cpu.max"
    cat "/sys/fs/cgroup$lab_cgroup/cpu.stat"
    sleep 2
    cat "/sys/fs/cgroup$lab_cgroup/cpu.stat"
else
    printf 'Service group unavailable; check service state\n' >&2
fi
```

Nếu file cần quyền, đọc bằng quyền đã được cấp trong VM. Điều kiện chặn đường dẫn rỗng/gốc; nếu unit đã hết thời gian và thư mục biến mất, đọc lỗi rồi kiểm tra trạng thái, không thay bằng `/sys/fs/cgroup/cpu.stat` và coi là nhóm lab.

Ví dụ **minh họa** `cpu.max`:

```text
50000 100000
```

Đây là 50000 µs ngân sách trong kỳ 100000 µs; period thật có thể khác vì cấu hình/manager. Trong `cpu.stat`, đọc `usage_usec` — thời gian CPU đã tính, `nr_periods` — số kỳ liên quan bộ điều khiển, `nr_throttled` — số kỳ bị throttle, `throttled_usec` — thời gian throttling được thống kê. So độ chênh hai mẫu, không dùng tổng từ trước để kết luận riêng hai giây đó. Với workload liên tục cần CPU, thường thấy bộ đếm throttle tăng; nếu VM bận/đang bị giới hạn cha hoặc process đã dừng, kết quả có thể khác.

Một CPU máy nhàn nhưng nhóm hết quota vẫn có thể bị throttle: quota là trần ngân sách riêng, không là lời hứa được dùng mọi CPU rảnh. Không suy `throttled_usec` bằng chính xác độ trễ mỗi request hay số giây toàn máy không chạy; phạm vi/thống kê nhiều task có chi tiết riêng.

### 6.3. Xác nhận kết thúc và dọn đúng unit

Sau thời hạn:

```bash
systemctl show linux-cpu-lab -p ActiveState -p SubState -p Result -p MainPID
sudo systemctl stop linux-cpu-lab
sudo systemctl reset-failed linux-cpu-lab
```

Dừng chỉ unit lab vừa tạo nếu còn; reset-failed chỉ xóa trạng thái lỗi manager của unit đó. Service có thể hiện failed/timeout vì bị RuntimeMaxSec dừng, hoặc bị thu gom nên không còn unit tùy manager; đây không là kết quả “workload hoàn tất thành công”. Nếu lệnh báo unit không có, kiểm tra MainPID/group không còn và ghi nhận, không tạo lại vô hạn. Không lưu unit vào boot.

## 7. Lab 3 chỉ trong VM: PID/mount namespace tạm, không cài engine

Đầu tiên ghi `ps -ef` trên VM và tham chiếu namespace của shell như mục 5. **`unshare`** là công cụ tạo phạm vi mới cho process/con theo lựa chọn; lệnh này không tạo quota CPU/RAM hoặc image riêng.

Trên VM được phép tạo namespace:

```bash
sudo unshare --mount --pid --fork --mount-proc --propagation private \
  sh -c 'printf "PID inside: %s\n" "$$"; ps -ef; printf "namespace lab finished\n"'
```

`--mount` tạo mount namespace, `--pid` chọn PID namespace cho con, `--fork` chạy con trong phạm vi ấy, `--mount-proc` gắn `/proc` phù hợp để `ps` đọc nhất quán. **Mount propagation — cách lan sự kiện mount giữa cây liên quan** cần kiểm soát; `--propagation private` tách lan truyền cho lab, tránh suy mọi mount mới trong namespace luôn mặc định không lan ở mọi phiên bản/cấu hình. **`sh -c`** chạy chuỗi lệnh bằng shell được chọn; `$$` lúc đó là PID shell bên trong. Xem [unshare(1)](https://man7.org/linux/man-pages/man1/unshare.1.html).

Kỳ vọng dòng đầu `PID inside: 1`, process list nhỏ gồm shell/ps của namespace, khác list VM ngoài. Dòng printf cuối giữ shell thực hiện thêm bước sau `ps`, tránh diễn giải một tối ưu exec lệnh cuối của shell thành lỗi danh tính. Host/VM ngoài vẫn có PID khác cho các process này; namespace tách góc nhìn chứ không xóa mọi process ngoài. Khi lệnh thoát, không còn process/tham chiếu của lab thì tài nguyên namespace tạm được thu hồi theo cơ chế.

Một số VM/container/policy không cho unshare hoặc mount proc. Ghi lỗi và dừng, không đổi sysctl/AppArmor/seccomp host để ép chạy. Biến thể rootless cần user namespace mapping cùng quyền/chính sách phù hợp; không đơn giản bỏ `sudo` rồi mặc định mọi mount/PID namespace vẫn tạo được. Lab không ghi file dữ liệu host, không đổi hostname/network/firewall và không xây rootfs.

## 8. Rootfs, overlay và dữ liệu tồn tại sau container nằm ở đâu?

**Overlay filesystem — filesystem chồng lớp** có thể ghép **lower layer — lớp nền** và **upper layer — lớp ghi** thành **merged view — góc nhìn hợp nhất**. File không đổi có thể lấy từ nền; lần sửa đầu có thể **copy-up — đưa dữ liệu/metadata cần thiết lên lớp ghi** trước khi sửa theo cơ chế. **Whiteout — dấu che tên ở lớp dưới** có thể biểu diễn việc xóa trong góc nhìn hợp nhất mà không sửa lớp nền. Chi tiết copy-up/metadata và biểu diễn whiteout phụ thuộc filesystem/tùy chọn. Xem [OverlayFS của kernel](https://docs.kernel.org/filesystems/overlayfs.html).

```text
lower: image có config.txt, app
upper: thay đổi riêng của container
             |
             v
merged: ứng dụng nhìn cây hợp nhất

Dữ liệu volume/bind mount: vị trí được quản lý riêng, không tự thuộc image layer
```

Đọc từ các lớp xuống merged: đây là cách tạo góc nhìn file, không tự tạo quyền/cgroup. **Volume — vùng dữ liệu được quản lý để gắn cho container** giúp tách vòng đời dữ liệu khỏi writable layer — lớp ghi riêng. **Bind mount** dùng cây đã có ở host; vị trí, owner/quyền và backup thuộc thiết kế cụ thể. Không mặc định volume có backup chỉ vì nó sống lâu hơn container.

Image layer không thay thế nơi giữ database/file cần tồn tại. Xóa container có thể mất writable layer; cập nhật image có thể tạo instance mới chưa có dữ liệu cũ. Trước backup, xác định dữ liệu thực nằm ở layer/volume/bind mount nào, có nhất quán ứng dụng hay không và phục hồi vào đâu. Không suy ổ host còn nguyên nghĩa container mới tự thấy dữ liệu. Xem [Docker storage drivers](https://docs.docker.com/engine/storage/drivers/).

Bài chỉ đọc cơ chế; không mount OverlayFS, thay storage driver hoặc xóa container/dữ liệu thật trên host. Distro/rootfs đổi không tự thay kernel đang chạy của host Linux liên quan.

## 9. Lỗi thường gặp và tự kiểm tra

| Suy luận dễ sai | Điều cần kiểm chứng |
|---|---|
| PID 1 bên trong nghĩa toàn máy chỉ có một process | Góc nhìn PID namespace, list và PID ngoài |
| Namespace mới tự có quota | Cgroup/controller và giá trị limit thật |
| Cgroup mới tự có filesystem riêng | Mount namespace/rootfs/runtime, không gộp với nhóm tài nguyên |
| CPUQuota 50% là nửa mọi CPU | Ngân sách tương đương nửa một CPU, tổng trong nhóm |
| `cpu.weight=200` luôn dùng gấp đôi CPU | Chỉ tương đối khi cạnh tranh, còn quota/affinity và nhóm khác |
| `memory.max=max` nên không thể OOM | Tổ tiên/phạm vi và nhu cầu thật vẫn ảnh hưởng |
| Rootless đồng nghĩa không sửa được file host nào | Bind mount, UID mapping và quyền tài nguyên đã cấp |
| Đổi image Debian→Alpine đổi kernel | User space khác, kernel host liên quan vẫn chung |
| Ghép path cgroup rỗng rồi đọc root | Xác nhận đúng group, mount và service còn sống |

1. Host nhiều CPU nhàn, nhóm quota 50% vẫn throttle. Mâu thuẫn không? **Đối chiếu:** không; ngân sách giới hạn riêng, rảnh toàn máy không bỏ trần.
2. Trong container `uname -r` giống host, `/etc/os-release` khác. Giải thích? **Đối chiếu:** kernel chung và user space/rootfs riêng.
3. Hai mount namespace cùng tham chiếu file dữ liệu gốc. Ghi file có chắc riêng không? **Đối chiếu:** không; namespace tách cây mount, không tự copy dữ liệu.
4. Con `memory.max=max`, cha có giới hạn. Cần xem gì? **Đối chiếu:** giới hạn cha/tổng con, memory events đúng phạm vi và áp lực bộ nhớ.
5. PID namespace mới nhưng ps vẫn thấy list ngoài. Một giả thuyết? **Đối chiếu:** `/proc` chưa mount theo PID namespace mới hoặc chưa chạy đúng con.
6. Cài engine rootless có chứng minh seccomp/MAC/quota mọi container đủ chưa? **Đối chiếu:** không; xem cấu hình/thực thi từng lớp.
7. Service transient biến mất trước khi đọc cpu.stat. Có thể dùng root cpu.stat thay không? **Đối chiếu:** không; sai phạm vi, chạy lại có chủ đích trên VM nếu cần hoặc ghi hạn chế quan sát.
8. Xóa container rồi dữ liệu mất. Cần xác định gì trước lần backup tiếp? **Đối chiếu:** vị trí/vòng đời dữ liệu, layer/volume/bind mount và cách phục hồi, không chỉ tên image.

Giữ bảng namespace/cgroup/quyền, kết quả đọc host an toàn và sơ đồ cây giới hạn. Chỉ nếu đã làm VM lab, thêm cpu.max/cpu.stat trước–sau, trạng thái dừng unit và list PID trong namespace. Không tuyên bố đã áp quota hoặc tạo namespace nếu chỉ đọc ví dụ hoặc bị từ chối quyền.

**Mô hình ghi nhớ:** namespace quyết định tầm nhìn; cgroup quyết định accounting/điều khiển tài nguyên; credentials/capability/seccomp/MAC quyết định quyền và ràng buộc thao tác; runtime kết hợp chúng với rootfs và vòng đời. Kernel chung là ranh giới quan trọng, còn dữ liệu cần tồn tại phải có nơi/vòng đời riêng. Bài 37 nối mô hình này với VM và các lớp ảo hóa.

## Nguồn và phạm vi môi trường

Nguồn kernel, Linux man-pages, systemd, OCI và Docker được gắn cạnh nội dung. Tra `man 7 namespaces`, `man unshare`, `man systemd.resource-control`, `man 2 seccomp`, kernel/systemd/util-linux version trên VM. Cgroups v1/v2, quyền delegation, namespace view, storage driver và controller khác theo môi trường; không sửa hệ đang dùng chỉ để có kết quả giống ví dụ.
