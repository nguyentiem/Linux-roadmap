# Bài 37 — Virtualization và thiết kế tài nguyên

[Mục lục](../README.md) · [← Bài 36](36-container-cgroups.md) · [Bài 38 →](38-build-kernel.md)

## Mục tiêu

Cần bài 05, 31, 36. Giải thích guest/host/hypervisor và tìm bottleneck nằm ngoài guest.

## 1. Virtualization và emulation

Hardware-assisted virtualization cho guest thực thi nhiều lệnh trực tiếp trên CPU với hỗ trợ cách ly và trap/exit. Emulation mô phỏng kiến trúc hoặc thiết bị bằng phần mềm. QEMU có thể làm emulation; kết hợp KVM trên nền tảng phù hợp để tăng tốc VM. KVM không đồng nghĩa mọi hoạt động I/O không có overhead.

vCPU là tài nguyên guest nhìn thấy nhưng host vẫn phải lập lịch thread thực thi tương ứng. Overcommit cấp tổng vCPU/RAM logic vượt tài nguyên vật lý có thể hợp lý khi workload không cùng peak, nhưng cần mô hình và headroom. Thêm vCPU không đảm bảo giảm wait nếu host đã cạnh tranh.

## 2. I/O ảo và memory

Virtio là giao diện thiết bị paravirtualized nhằm giảm chi phí mô phỏng thiết bị truyền thống. Guest cần driver phù hợp. Disk guest có thể đi qua filesystem host, file image, cache host và storage vật lý; direct I/O ở guest không nhất thiết bỏ mọi cache ở các tầng đó.

Memory ballooning hoặc host swapping làm guest chịu tác động không rõ từ `free` bên trong. Steal time, khi được nền tảng cung cấp, phản ánh thời gian vCPU bị lấy khỏi thực thi; không có chỉ số này không chứng minh không có cạnh tranh host.

## 3. Mạng và snapshot

NAT thuận tiện cho outbound và port forwarding; bridge đưa guest vào segment mạng; internal/host-only phù hợp cô lập lab. Chọn theo đường truy cập cần thiết, không coi bridged mặc định là nhanh hoặc an toàn hơn.

Snapshot disk, snapshot có RAM và application-consistent backup khác nhau. Snapshot chain dài có thể ảnh hưởng quản lý dung lượng và I/O. Clone VM cần xem hostname, machine identity, SSH host key, địa chỉ và UUID theo quy trình nền tảng.

## 4. Lab: so sánh guest và host

Trên guest:

```bash
systemd-detect-virt
lscpu
lsblk -o NAME,MODEL,TRAN,SIZE
vmstat 1 10
```

Chạy một workload CPU có giới hạn thời gian từ bài 19 hoặc fio file lab bài 33. Đồng thời quan sát host bằng công cụ OS/hypervisor. Ghi vCPU, host core, RAM guest, RAM host, disk backing, workload cùng host và sample cùng timestamp.

Thử tăng vCPU từ 1 lên 2 khi VM đã tắt theo yêu cầu hypervisor. Chạy lại cùng workload **một thread**, rồi workload **hai process độc lập**. Một thread thường không tăng tốc gấp đôi chỉ vì tăng vCPU; hai process có thể hưởng lợi nếu host còn tài nguyên.

## 5. Lab QEMU image metadata

Nếu đã cài `qemu-img`, tạo image trống để học metadata:

```bash
image_dir=$(mktemp -d "$HOME/linux-lab/qcow.XXXXXX")
qemu-img create -f qcow2 "$image_dir/empty.qcow2" 1G
qemu-img info "$image_dir/empty.qcow2"
du -h "$image_dir/empty.qcow2"
```

Virtual size 1 GiB khác dung lượng host thực dùng. Không chạy repair/convert trên image đang được VM ghi. Xóa đúng image/thư mục lab khi hoàn tất; image này chưa chứa hệ điều hành.

## 6. Kiểm tra đạt

Nộp bảng trước/sau vCPU với một và hai worker, giải thích yếu tố host. Thiết kế topology ba VM proxy/app/db và chỉ rõ đường quản trị, mạng dịch vụ, storage và snapshot/backup.

## Đọc thêm

`man qemu-img`, `man systemd-detect-virt`; [QEMU system emulation](https://www.qemu.org/docs/master/system/index.html), [KVM documentation](https://docs.kernel.org/virt/kvm/index.html).
