# Bài 37 — Virtualization và thiết kế tài nguyên

[Mục lục](../README.md) · [← Bài 36](36-container-cgroups.md) · [Bài 38 →](38-build-kernel.md)

## Mục tiêu: máy ảo chậm, phải tìm nguyên nhân ở máy nào?

Bạn có một máy Linux nhìn thấy 2 CPU và 4 GiB RAM, nhưng công việc thường xuyên chậm. Bên trong không có tiến trình khác dùng nhiều CPU. Điều chưa biết là máy ấy có chạy trên phần cứng riêng hay được chia tài nguyên cùng nhiều máy khác; ổ đĩa của nó có thể chỉ là một file trên máy chủ đang bận.

**Virtualization — ảo hóa** tạo môi trường máy tính với tài nguyên được phân chia và quản lý để nhiều hệ có thể dùng chung phần cứng. **VM — virtual machine, máy ảo** có CPU, RAM và thiết bị mà hệ điều hành bên trong nhìn như một máy riêng. **Guest — hệ khách** là hệ bên trong VM; **host — hệ chủ** cung cấp tài nguyên cho VM. **Hypervisor — lớp quản lý máy ảo** tổ chức cách guest sử dụng phần cứng và duy trì ranh giới giữa các máy.

Sau bài này, bạn cần nối số đo guest với host, phân biệt ảo hóa/mô phỏng, hiểu vCPU/virtio và đường I/O nhiều tầng, chọn mạng và phân biệt snapshot với backup. Cần bài 05, 31, 36. Lab chính chỉ đọc thông tin và tạo image trống trong thư mục riêng; không tự triển khai VM hoặc sửa mạng/dịch vụ host.

## 1. Guest có kernel riêng hay chỉ là container?

**Kernel — nhân hệ điều hành** là lõi quản lý CPU, bộ nhớ và thiết bị. **User space — phần chương trình ngoài nhân** gồm ứng dụng, thư viện, shell và công cụ hệ thống. **Process — tiến trình** là một lần chương trình đang hoạt động. **Container — môi trường nhóm tiến trình được cách ly** trên Linux thông thường dùng cùng kernel host, còn VM chạy kernel guest riêng.

```text
Máy chủ vật lý
  Kernel host + lớp quản lý VM
       ├── VM A: thiết bị ảo → kernel A → ứng dụng A
       └── VM B: thiết bị ảo → kernel B → ứng dụng B

Container thông thường:
  Kernel host
       ├── nhóm tiến trình container A
       └── nhóm tiến trình container B
```

Đọc từ host xuống: VM có một tầng kernel khách, container thông thường thì không. Vì thế thử một kernel lỗi trong VM thường không thay kernel host; chỉnh giới hạn container vẫn tác động nhóm tiến trình dùng nhân host. Một container có thể lại nằm trong VM, nên hai cơ chế có thể lồng nhau.

Ví dụ `uname -r` trong VM trả kernel guest; trong container thường trả kernel dùng chung với host. Kết quả khác hostname hoặc distro không tự chứng minh kernel riêng. **Distro — bản phân phối** là tập kernel/công cụ/cấu hình đóng gói; user space của container có thể là distro khác host.

## 2. Ảo hóa có hỗ trợ phần cứng và emulation khác nhau thế nào?

**Emulation — mô phỏng** dùng phần mềm tái tạo hành vi CPU/thiết bị. Ví dụ máy x86-64 có thể dùng QEMU mô phỏng CPU ARM để chạy mã ARM, nhưng thường chậm hơn thực thi trực tiếp. **Architecture — kiến trúc lệnh** quy định loại lệnh CPU hiểu, như x86-64 hoặc AArch64; không phải chỉ tên hãng CPU.

**Hardware-assisted virtualization — ảo hóa có phần cứng hỗ trợ** cho guest thực hiện nhiều lệnh trên CPU thật trong chế độ có kiểm soát. Một số thao tác khiến quyền điều khiển quay về lớp quản lý qua **VM exit — thoát từ chạy guest về xử lý bên ngoài**; sau xử lý, guest tiếp tục. Điều đó giúp cách ly mà không cần mô phỏng từng lệnh theo cách thuần phần mềm.

**QEMU** cung cấp mô hình máy/thiết bị và nhiều cách thực thi CPU. **KVM — Kernel-based Virtual Machine** là giao diện/cơ chế trong Linux hỗ trợ chạy VM bằng khả năng ảo hóa của phần cứng. **TCG — Tiny Code Generator** là cơ chế QEMU dịch/mô phỏng mã CPU khi không dùng bộ tăng tốc phần cứng. QEMU có thể dùng KVM khi host/guest/CPU hỗ trợ phù hợp; không phải cứ gọi QEMU là đã dùng KVM. [QEMU introduction](https://www.qemu.org/docs/master/system/introduction.html), [KVM API](https://docs.kernel.org/virt/kvm/api.html).

Ví dụ khái niệm:

```text
QEMU + TCG: mã guest → phần mềm dịch/mô phỏng → CPU host
QEMU + KVM: mã guest → CPU hỗ trợ chạy guest
                         ↓ khi cần xử lý ngoài guest
                      KVM/QEMU xử lý rồi tiếp tục
```

Mũi tên thứ hai không có nghĩa mọi I/O đi thẳng xuống phần cứng. **I/O — nhập/xuất** là trao đổi dữ liệu với thiết bị; mô hình thiết bị, kiểm tra quyền và đường lưu trữ/mạng vẫn có chi phí. **Overhead — chi phí phụ** là công việc quản lý thay vì việc ứng dụng cần làm.

Chỉ đọc khả năng trên host Linux nếu được phép:

```bash
lscpu
ls -l /dev/kvm
```

`lscpu` in CPU/đặc tính mà môi trường nhìn thấy; `/dev/kvm` là điểm truy cập giao diện KVM nếu được cung cấp. Có file chưa chứng minh user có quyền dùng hoặc một VM đang dùng KVM; không có file có thể do cấu hình/giới hạn container. Trong một guest, phần cứng ảo hóa lồng nhau cũng không luôn được cung cấp. Cần đọc cấu hình/lệnh khởi chạy VM thật, không suy chỉ từ tên QEMU.

## 3. vCPU có phải là một CPU vật lý dành riêng?

**vCPU — CPU ảo** là đơn vị xử lý guest nhìn thấy. Trên cấu hình QEMU/KVM thông thường, host cần lập lịch các luồng thực thi vCPU tương ứng. **Thread — luồng thực thi** là dòng lệnh có trạng thái chạy riêng trong tiến trình. **Scheduler — bộ lập lịch** của host quyết định luồng nào thực sự nhận CPU vật lý/logic; scheduler guest lại quyết định chương trình nào dùng vCPU.

```text
Ứng dụng guest → scheduler guest → vCPU
                                      |
                                      v
                          luồng thực thi trên host
                                      |
                                      v
                            scheduler host → CPU thật
```

Có hai lần phân chia tài nguyên. Guest thấy chương trình đã được chọn nhưng luồng vCPU có thể còn đợi host. **Logical CPU — CPU logic** là đơn vị host có thể lập lịch; các CPU logic có thể chia một nhân vật lý, nên số lượng không tự đổi thành sức tính toán tương đương.

**Overcommit — cấp tổng tài nguyên logic vượt phần vật lý có sẵn** có thể hợp lý khi các VM không đạt đỉnh cùng lúc. Ví dụ host có 8 CPU logic cấp 4 VM × 4 vCPU = 16 vCPU; đây không tự là sai nhưng nếu mọi VM cùng cần toàn phần, chúng phải chờ/chia. **Peak — mức tải đỉnh** và **headroom — phần dự phòng** cần dựa vào công việc và kịch bản, không chỉ cộng số vCPU.

Thêm vCPU không tự tăng tốc một luồng tuần tự. Hai công việc độc lập có thể chạy song song nếu guest/host còn CPU; một công việc đợi ổ đĩa không được chữa bằng tăng vCPU. Pin vCPU có thể thay cách tranh tài nguyên nhưng không tạo độc quyền nếu host vẫn cho việc khác chạy trên cùng CPU.

**Steal time — thời gian CPU khách bị nền tảng ghi nhận là không được thực thi do host** khi có hỗ trợ có thể giúp nhận diện tranh tài nguyên. Cột `st` của công cụ như `vmstat` là một tín hiệu, không kể đầy đủ mọi chi phí VM hoặc mọi nguyên nhân chậm. `st=0` hoặc thiếu chỉ số không chứng minh host không cạnh tranh. [Cơ chế steal time KVM x86](https://docs.kernel.org/virt/kvm/x86/msr.html).

## 4. Disk ảo và RAM có những tầng nào ngoài guest?

### 4.1. Virtio và đường lưu trữ

**Driver — trình điều khiển thiết bị** là mã giúp kernel giao tiếp thiết bị. **Virtio** là giao diện thiết bị thiết kế cho ảo hóa, thường gọi **paravirtualized — guest biết giao diện dành cho môi trường ảo**; guest cần driver phù hợp. Nó tránh nhiều chi phí mô phỏng thiết bị truyền thống, không loại bỏ mọi chi phí lưu trữ.

**Filesystem — hệ tổ chức tệp** quản lý tên, nội dung và thông tin tệp. **Image — file biểu diễn ổ đĩa ảo** có thể nằm trên filesystem host. **Cache — bộ đệm** giữ dữ liệu để truy cập nhanh. Một đường lưu phổ biến, không áp mọi nền tảng:

```text
Ứng dụng guest → filesystem guest → driver disk ảo
                                            |
                                            v
                              QEMU/lớp thiết bị host
                                            |
                                            v
                      file image → filesystem/cache host
                                            |
                                            v
                               thiết bị lưu trữ vật lý
```

Guest đo chậm có thể do bất kỳ tầng nào. **Direct I/O — chế độ cố giảm/bỏ qua bộ đệm ở tầng được yêu cầu** trong guest không có nghĩa bypass cache host, controller hoặc mọi bộ đệm phía sau. **Durability — khả năng dữ liệu còn sau sự cố** còn phụ thuộc đường flush, chế độ cache và đảm bảo của thiết bị; tốc độ ghi cao không tự chứng minh dữ liệu đã bền.

**Backing storage — nơi thật chứa dữ liệu đĩa ảo** có thể là file, thiết bị block, mạng lưu trữ hoặc nhiều tầng. Ghi rõ loại này trước so kết quả fio; **fio** là công cụ tạo/đo I/O theo cấu hình công việc. Không thử lên image đang dùng bằng thao tác repair/convert để “tối ưu”.

### 4.2. RAM cấp cho guest không là toàn bộ điều kiện bộ nhớ

**RAM — bộ nhớ làm việc** được dùng cho dữ liệu đang xử lý. **Ballooning — cơ chế thu/trả phần bộ nhớ của guest theo phối hợp với host** dùng driver trong guest và chính sách nền tảng để điều chỉnh lượng có thể dùng. **Swap — chuyển dữ liệu bộ nhớ sang nơi lưu để nhường RAM** ở host có thể làm VM chậm dù bên trong guest trông còn bộ nhớ.

Guest `free` chỉ phản ánh bộ nhớ theo góc nhìn guest; không báo chắc host còn RAM, có đang swap các trang VM hoặc bị nhóm tài nguyên giới hạn. Host cũng cần RAM cho chính hệ quản lý và các việc ngoài VM. **GiB — gibibyte** bằng 2^30 byte; phân biệt đơn vị khi lập bảng dung lượng.

Ví dụ host 16 GiB, hai VM mỗi 8 GiB không tự là cấu hình an toàn: tổng đã bằng RAM vật lý mà chưa tính host/công cụ khác; việc VM có chạm hết RAM hay không và chính sách cấp bộ nhớ cũng ảnh hưởng. Cần nhìn mức dùng thực, áp lực bộ nhớ và phần dự phòng, không chỉ cấu hình cấp.

## 5. Mạng NAT, bridge và host-only thay đổi đường đi nào?

**NAT — chuyển đổi địa chỉ mạng** đổi địa chỉ/cổng trên đường truyền; thường thuận tiện cho guest gọi ra ngoài. **Port forwarding — chuyển tiếp cổng** đưa một cổng phía host tới cổng guest để bên ngoài tiếp cận dịch vụ đã chọn. **Bridge — cầu mạng** nối các giao diện vào cùng phân đoạn ở tầng liên kết; guest có thể tham gia mạng như một máy khác tùy cấu hình. **Segment — phân đoạn mạng** là phần các nút có khả năng trao đổi theo một miền liên kết nhất định.

**Host-only network — mạng giữa host và guest được bố trí để tách khỏi đường ngoài** và **internal network — mạng nội bộ các guest** là tên ý tưởng thường gặp; ý nghĩa chính xác theo nền tảng. Trong libvirt, một mạng không có forward có thể vẫn cho host và guest trao đổi; không coi từ “isolated” là không ai truy cập được. [Mô tả mạng libvirt](https://libvirt.org/formatnetwork.html).

| Cần gì? | Cách thường xem xét | Điều phải kiểm tra |
|---|---|---|
| Guest tải gói ra ngoài | NAT hoặc mạng được phép outbound | DNS, route và firewall thật |
| Host quản trị guest, không công khai mọi dịch vụ | Host-only hoặc forward cổng cụ thể | Địa chỉ lắng nghe của cổng host, ai đến được |
| Guest là máy trên mạng vật lý | Bridge phù hợp hạ tầng | Quyền tham gia mạng, địa chỉ và chính sách bảo vệ |
| Lab nhiều VM trao đổi nội bộ | Mạng riêng giữa VM | Host có đường vào không, có route ngoài không |

**Firewall — bộ lọc lưu lượng** và cấu hình dịch vụ vẫn cần dù chọn NAT/bridge. Bridge không mặc định nhanh hơn hay an toàn hơn: nó thay topology và phạm vi truy cập, còn hiệu năng phụ thuộc triển khai/tải.

## 6. Snapshot, clone và backup có thay nhau được không?

**Snapshot — mốc ghi lại trạng thái theo cơ chế nền tảng** có thể chỉ giữ disk hoặc cả disk/RAM/trạng thái thiết bị. **Clone — bản sao VM** tạo một máy khác từ nguồn. **Backup — bản sao phục hồi được quản lý và kiểm chứng** cần sống được qua loại sự cố mục tiêu, có thời hạn lưu và thử khôi phục.

**Crash-consistent — tương đương dữ liệu khi mất điện đột ngột** chưa bảo đảm ứng dụng đã ghi tất cả giao dịch. **Application-consistent — nhất quán theo ứng dụng** cần phối hợp đóng băng/flush và các thành phần liên quan. Snapshot có RAM có thể tiếp tục trạng thái tại mốc ấy nhưng không tự làm dữ liệu dịch vụ ngoài VM đồng bộ cùng mốc. [Snapshot libvirt](https://libvirt.org/formatsnapshot.html).

**COW — copy-on-write, sao chép khi ghi** cho phép giữ mốc cũ và ghi thay đổi vào tầng mới thay vì chép toàn disk mỗi lần. **Snapshot chain — chuỗi các tầng phụ thuộc** có thể tăng độ phức tạp quản lý/I/O; xóa một file backing sai cách có thể làm tầng sau không đọc được. Không xóa theo tên file mà chưa hiểu quan hệ.

Một snapshot trên cùng storage có thể mất cùng VM khi storage hỏng; không thay backup ngoài miền hỏng ấy. **Failure domain — miền có thể hỏng chung** là nhóm tài nguyên cùng bị một sự cố ảnh hưởng, như mọi image trên một ổ vật lý.

Khi clone, xem **hostname — tên máy**, **machine identity — định danh máy** dùng bởi các thành phần hệ thống, **SSH host key — khóa nhận diện server SSH**, địa chỉ mạng và **UUID — định danh được thiết kế duy nhất** của máy/đĩa theo quy trình nền tảng. Không cho hai clone vô tình dùng cùng địa chỉ hoặc khóa nhận diện như thể chúng là một máy; cũng không tự xóa mọi ID nếu ứng dụng cần giữ liên hệ dữ liệu.

## 7. Lab 1: chụp góc nhìn guest và host cùng khoảng thời gian

Điều kiện: đã có VM được phép thử, không tự triển khai/thay cấu hình host. **Shell — trình nhận lệnh**, như Bash, chạy lệnh. Trên guest:

```bash
date -u +%FT%TZ
systemd-detect-virt
lscpu
lsblk -o NAME,MODEL,TRAN,SIZE
free -h
vmstat 1 10
```

`systemd-detect-virt` nhận diện môi trường mà công cụ phát hiện, không chứng minh mọi chi tiết nền tảng. Nó có thể báo container trong VM vì nhìn lớp phù hợp/gần nhất theo chế độ; dùng `--vm`/`--container` theo manual để phân biệt. `lscpu` xem CPU guest thấy; `lsblk` xem thiết bị lưu trữ, `TRAN` trống không tự nghĩa disk hỏng. `free` cho RAM guest. `vmstat` gồm hàng chạy/chờ, swap, I/O và CPU; dòng đầu thường là trung bình từ boot, các dòng sau là mẫu theo khoảng. Cột `st` cần được nền tảng cung cấp.

Đồng thời đọc host bằng công cụ OS/hypervisor: ghi CPU logic/nhân vật lý, RAM, swap, nơi backing disk, các VM cùng host và thời gian mẫu. Đồng hồ giữa hai máy cần đủ đồng bộ để nối timeline. Nếu không có quyền/quan sát host, ghi **chưa có bằng chứng host**, không kết luận host rảnh từ guest.

Chạy tải CPU có giới hạn bài 19 hoặc fio file thử bài 33, giữ nguyên cấu hình/tải. Muốn so tăng vCPU từ 1 lên 2, chỉ thực hiện trên VM thử và theo quy trình tắt/hotplug của nền tảng; không thay VM đang phục vụ. **Hotplug — thêm/bớt tài nguyên khi đang chạy** không được mọi cấu hình hỗ trợ giống nhau.

## 8. Lab 2: một worker và hai worker có thật được lợi?

**Worker — phần việc thực thi độc lập** trong lab là một process tính toán. Dùng lượng việc cố định để thời gian hoàn tất có thể so; nếu dùng vòng chạy đúng 15 giây thì không thể kết luận nhanh hơn từ thời gian kết thúc giống nhau.

Trên guest thử có Python 3, lưu `cpu_work.py`:

```python
import multiprocessing as mp
import time

COUNT = 3_000_000

def work(_):
    result = 0
    for i in range(COUNT):
        result = (result + i * i) % 1_000_003
    return result

if __name__ == '__main__':
    jobs = [0, 1]  # Cùng tổng hai phần việc cho cả hai lần.
    for workers in (1, 2):
        start = time.monotonic()
        with mp.Pool(workers) as pool:
            results = pool.map(work, jobs)
        print('workers', workers, 'seconds', round(time.monotonic()-start, 3),
              'results', results)
```

```bash
python3 cpu_work.py
```

Tổng việc là hai lần COUNT ở cả hai trường hợp. Một worker làm nối tiếp; hai worker có thể làm đồng thời. Process riêng tránh coi hai thread Python thông thường là chắc chạy CPU song song; không phải mọi runtime/Python có cùng cơ chế.

Tiêu chí: hai danh sách results giống nhau; ghi thời gian một/hai worker và cấu hình 1/2 vCPU. Hai worker không bắt buộc nhanh gấp đôi vì tạo process, host cạnh tranh, CPU chia tài nguyên và tải nền. Lab hữu hạn số vòng nhưng không có cận thời gian tuyệt đối trên máy rất chậm; có thể dùng GNU `timeout 30s python3 cpu_work.py` để giới hạn và ghi lần hết hạn là chưa hoàn tất, không là số hiệu năng hợp lệ.

## 9. Lab 3: image dung lượng ảo khác dung lượng host đã dùng

Điều kiện: có `qemu-img`; chỉ tạo image trống mới, không dùng image VM đang hoạt động. **qcow2** là định dạng image của QEMU có metadata và hỗ trợ cấp chỗ theo nhu cầu. **Sparse allocation — cấp chỗ thưa** giữ dung lượng logic lớn mà chưa dùng toàn bộ block host.

```bash
command -v qemu-img
qemu-img --version
image_dir=$(mktemp -d)
qemu-img create -f qcow2 "$image_dir/empty.qcow2" 1G
qemu-img info "$image_dir/empty.qcow2"
du -h "$image_dir/empty.qcow2"
```

`create` tạo file riêng; `1G` trong ví dụ QEMU biểu diễn 1 GiB. `virtual size` là dung lượng guest có thể thấy; `disk size`/`du` phản ánh chỗ host hiện dùng theo công cụ/filesystem. Image trống vẫn có metadata, nên chỗ dùng không bằng 0 và thường nhỏ hơn 1 GiB. Nó chưa có partition/filesystem/OS nên chưa là VM boot được. [QEMU image utility](https://www.qemu.org/docs/master/tools/qemu-img.html).

Sau ghi kết quả, xóa đúng file và thư mục lab:

```bash
rm -- "$image_dir/empty.qcow2"
rmdir -- "$image_dir"
```

Không chạy repair/convert trên image đang được VM ghi. Metadata đọc được chưa chứng minh filesystem hay ứng dụng bên trong khỏe; snapshot/COW của host có thể làm dung lượng theo các phép đo khác nhau.

## 10. Lỗi thường gặp và tự kiểm tra

| Suy luận sai | Kiểm tra lại |
|---|---|
| Guest CPU thấp nên host không nghẽn | Đọc host, vCPU scheduling, quota và steal time có điều kiện |
| Thêm vCPU tự tăng tốc gấp đôi | Giữ tổng việc, xét khả năng song song và tài nguyên host |
| Direct I/O guest bỏ mọi cache | Vẽ đủ đường thiết bị/image/filesystem/cache host |
| Guest RAM đủ nên VM không swap | Kiểm tra RAM/swap/chính sách host |
| Bridge luôn nhanh/an toàn hơn | Xét đường truy cập, firewall, triển khai và tải |
| Snapshot trên cùng disk là backup chống hỏng disk | Xét failure domain và thử restore từ bản độc lập |
| Image virtual 1 GiB nghĩa host đã dùng 1 GiB | Đối chiếu virtual size với block thật/du |

1. Một container chạy trong VM: `uname -r` của container thường báo kernel nào? **Đối chiếu:** kernel guest của VM chứa nó, không mặc định kernel host vật lý.
2. Host có 8 CPU logic cấp 16 vCPU: có đủ CPU đồng thời khi mọi task đều bận không? **Đối chiếu:** phải chia/chờ, còn phụ thuộc quan hệ CPUlogic/nhân và công việc khác.
3. `st=0` có loại trừ vấn đề host? **Đối chiếu:** không; hỗ trợ/accounting và các tầng khác có giới hạn.
4. Hai VM khác tên nằm cùng storage có độc lập trước lỗi storage không? **Đối chiếu:** không.
5. Snapshot disk có bảo đảm giao dịch database bên ngoài VM cùng mốc? **Đối chiếu:** không; cần phối hợp dữ liệu/phụ thuộc.

Nộp bảng vCPU/CPU host/RAM/backing storage, kết quả một/hai worker nếu đã chạy, metadata image, và topology ba VM proxy/app/database. Chỉ rõ đường quản trị, mạng dịch vụ, nơi dữ liệu, failure domain và backup phục hồi; sơ đồ thiết kế không đòi triển khai ba VM thật.

**Tự nhắc lại:** VM có kernel khách và tài nguyên nhìn qua nhiều lớp. Đo guest trước nhưng không dừng ở guest; CPU, RAM, disk và mạng đều phụ thuộc host. Snapshot giữ mốc theo cơ chế nền tảng, backup phải sống qua loại sự cố muốn phòng. Bài 38 dùng QEMU để thử kernel trong phạm vi riêng.

## Nguồn đối chiếu

- [QEMU introduction](https://www.qemu.org/docs/master/system/introduction.html), [invocation](https://www.qemu.org/docs/master/system/invocation.html), [qemu-img](https://www.qemu.org/docs/master/tools/qemu-img.html): tài liệu master có thể mới hơn bản cài; đối chiếu `--version`/help.
- [KVM API](https://docs.kernel.org/virt/kvm/api.html), [KVM x86 steal time](https://docs.kernel.org/virt/kvm/x86/msr.html).
- [Libvirt network](https://libvirt.org/formatnetwork.html), [snapshot](https://libvirt.org/formatsnapshot.html): ý nghĩa topology/trạng thái tùy triển khai thực tế.
