(function () {
  const body = document.body;
  if (!body || !body.classList.contains('lesson-page')) return;

  const progress = document.createElement('div');
  progress.className = 'lesson-progress';
  progress.setAttribute('aria-hidden', 'true');
  body.appendChild(progress);

  // Keep this sequence in the same order as the course index, including both parts of lesson 13.
  const lessonFiles = [
    'Bai_01_Nen_tang_may_tinh_va_he_dieu_hanh.html',
    'Bai_02_Linux_GNU_Linux_va_Ban_Phan_Phoi.html',
    'Bai_03_Kien_truc_Linux_Day_du_Interactive.html',
    'Bai_04_Linux_va_RTOS_Day_Du.html',
    'Bai_05_Linux_Lab_Day_Du.html',
    'Bai_06_Terminal_Shell_Tra_Cuu_Day_Du.html',
    'Bai_07_Cay_thu_muc_va_cac_loai_file.html',
    'Bai_08_Thao_tac_file_Pipe_Redirect_Day_du.html',
    'Bai_09_Tim_kiem_Regex_Xu_ly_van_ban_Day_du.html',
    'Bai_10_User_Group_Quyen_Truy_Cap_Linux_Doc_Lap.html',
    'Bai_11_Package_Repository_Thu_vien.html',
    'Bai_12_Process_Thread_Signal.html',
    'Bai_13_Shell_Scripting_Seminar.html',
    'Bai_13_Shell_Scripting_Tiep_Theo.html',
    'Bai_14_Boot_Shutdown_Linux_Day_Du.html',
    'Bai_15_systemd_log_cuu_ho_dich_vu.html',
    'Bai_16_System_Call_Vong_Doi_Chuong_Trinh.html',
    'Bai_17_Quan_ly_bo_nho_Page_Fault.html',
    'Bai_18_Thuat_toan_lap_lich_CPU.html',
    'Bai_19_Scheduler_Linux_Day_Du.html',
    'Bai_20_Real_Time_Scheduling_PREEMPT_RT.html',
    'Bai_21_Storage_Stack_Filesystem_Day_Du.html',
    'Bai_22_LVM_RAID_LUKS_Backup_Day_Du.html',
    'Bai_23_Driver_Module_Duong_di_IO_Day_du.html',
    'Bai_24_Nen_tang_mang_Linux_hoan_chinh.html',
    'Bai_25_Dich_vu_mang_Reverse_Proxy_Firewall.html',
    'Bai_26_Xac_thuc_Capabilities_MAC_Day_du.html',
    'Bai_27_Hardening_Quan_ly_ban_va_Linux.html',
    'Bai_28_Ansible_Day_Du_Tuong_Tac.html',
    'Bai_29_Quan_sat_va_van_hanh_dich_vu.html',
    'Bai_30_Backup_Recovery_Quan_ly_thay_doi.html',
    'bai31_bottleneck.html',
    'Bai_32_Phan_tich_CPU_Bo_nho_chuyen_sau.html',
    'Bai_33_Phan_tich_hieu_nang_IO_va_mang.html',
    'Bai_34_Debugging_Tracing_Crash_Analysis_Day_Du.html',
    'Bai_35_Dong_thoi_Khoa_Xu_ly_Bat_dong_bo.html',
    'Bai_36_Container_Namespace_Cgroups_v2_Full.html',
    'Bai_37_Virtualization_Thiet_ke_tai_nguyen.html',
    'Bai_38_Build_Linux_Kernel_QEMU_Day_Du.html',
    'Bai_39_Thiet_ke_va_xu_ly_su_co_Senior.html'
  ];
  const currentFile = decodeURIComponent(location.pathname.split('/').pop());
  const currentIndex = lessonFiles.indexOf(currentFile);
  const navigation = document.createElement('nav');
  navigation.className = 'lesson-navigation';
  navigation.setAttribute('aria-label', 'Điều hướng bài học');

  const home = document.createElement('a');
  home.className = 'lesson-home';
  home.href = 'index.html';
  home.textContent = '← Tất cả bài học';
  home.setAttribute('aria-label', 'Trở về mục lục tất cả bài học');
  navigation.appendChild(home);

  const backToTop = document.createElement('button');
  backToTop.className = 'lesson-top';
  backToTop.type = 'button';
  backToTop.textContent = '↑ Về đầu trang';
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  navigation.appendChild(backToTop);

  if (currentIndex !== -1) {

    function addLink(file, direction, extraLabel) {
      const link = document.createElement('a');
      link.href = file;
      link.className = `lesson-home lesson-navigation-${direction}`;
      const number = file.match(/(?:Bai_|bai)(\d+)/i)?.[1];
      link.textContent = direction === 'previous'
        ? `← Bài trước · Bài ${number}${extraLabel}`
        : `Bài sau · Bài ${number}${extraLabel} →`;
      navigation.appendChild(link);
    }

    function addUnavailable(label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = true;
      navigation.appendChild(button);
    }

    if (currentIndex > 0) {
      const previousFile = lessonFiles[currentIndex - 1];
      addLink(previousFile, 'previous', previousFile.includes('Seminar') ? ' · Seminar' : previousFile.includes('Tiep_Theo') ? ' · Tiếp theo' : '');
    } else {
      addUnavailable('← Bài trước');
    }
    if (currentIndex < lessonFiles.length - 1) {
      const nextFile = lessonFiles[currentIndex + 1];
      addLink(nextFile, 'next', nextFile.includes('Seminar') ? ' · Seminar' : nextFile.includes('Tiep_Theo') ? ' · Tiếp theo' : '');
    } else {
      addUnavailable('Bài sau →');
    }
  }
  body.appendChild(navigation);

  let scheduled = false;
  function updateProgress() {
    scheduled = false;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    const value = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 1;
    progress.style.transform = `scaleX(${value})`;
  }
  function scheduleProgress() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateProgress);
  }
  addEventListener('scroll', scheduleProgress, { passive: true });
  addEventListener('resize', scheduleProgress);
  updateProgress();

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.section, .hero, .diagram, .interactive, .visual');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('lesson-appear');
        observer.unobserve(entry.target);
      }
    }, { threshold: .08, rootMargin: '0px 0px 30px 0px' });
    targets.forEach(target => observer.observe(target));
  }
})();
