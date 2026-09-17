  // Edit SOP
  const handleUpdateSop = async (updatedSop: SopDocument) => {
    const currentSop = sops.find((s) => s.id === updatedSop.id);

    // Dokumen harus masih ada dan user harus memiliki hak edit.
    // User biasa hanya dapat mengedit DRAFT.
    // Admin dapat mengedit DRAFT, AKTIF, maupun DIARSIPKAN.
    if (!currentSop || !canEditExistingSop(currentSop, userSession)) {
      addToast(
        'error',
        'Edit Ditolak',
        'Anda tidak memiliki izin untuk mengedit dokumen ini.'
      );
      setSelectedSopForEdit(null);
      return;
    }

    // Selalu pertahankan identitas/workflow dokumen yang authoritative.
    updatedSop = preserveSopWorkflowIdentity(currentSop, updatedSop);

    const isLegacy =
      updatedSop.documentType === 'LAMA' ||
      updatedSop.isLegacySop;

    const normalizedDivision = (
      updatedSop.divisionCode ||
      (updatedSop.sopNumber
        ? updatedSop.sopNumber.split('/')[0]?.trim()
        : 'PEL') ||
      'PEL'
    )
      .trim()
      .toUpperCase();

    const normalizedHierarchy = (
      updatedSop.subHierarchyCode || ''
    )
      .trim()
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');

    const effectiveYear =
      updatedSop.effectiveDate?.slice(0, 4) ||
      (updatedSop.createdAt
        ? String(new Date(updatedSop.createdAt).getFullYear())
        : SOEGIRI_HOSPITAL_INFO.year || '2026');

    let normalizedSequence =
      typeof updatedSop.sequenceNumber === 'number' &&
      updatedSop.sequenceNumber > 0
        ? updatedSop.sequenceNumber
        : 1;

    let normalizedNumber = updatedSop.sopNumber || '';

    if (!isLegacy) {
      const previousHierarchy = (
        currentSop.subHierarchyCode || ''
      ).trim();

      const previousDivision = (
        currentSop.divisionCode || ''
      )
        .trim()
        .toUpperCase();

      const previousYear =
        currentSop.effectiveDate?.slice(0, 4) ||
        (currentSop.createdAt
          ? String(new Date(currentSop.createdAt).getFullYear())
          : '');

      const unitChanged =
        previousDivision !== normalizedDivision ||
        previousHierarchy !== normalizedHierarchy ||
        previousYear !== effectiveYear;

      const used = getUsedSequencesForUnit(
        sops.filter((s) => s.id !== updatedSop.id),
        normalizedDivision,
        normalizedHierarchy,
        effectiveYear
      );

      if (unitChanged || used.has(normalizedSequence)) {
        normalizedSequence = getNextSequenceNumber(
          numberingConfig,
          normalizedDivision,
          normalizedHierarchy,
          sops.filter((s) => s.id !== updatedSop.id),
          effectiveYear
        );
      }

      const padded = getPaddedNumber(normalizedSequence, 3);

      normalizedNumber = normalizedHierarchy
        ? `${normalizedDivision} / ${normalizedHierarchy} / ${padded} / ${effectiveYear}`
        : `${normalizedDivision} / ${padded} / ${effectiveYear}`;
    }

    // Cegah nomor SPO duplikat saat edit.
    const dupCheck = checkDuplicateSopNumber(
      sops,
      normalizedNumber,
      updatedSop.id
    );

    if (dupCheck.isDuplicate && dupCheck.matchedDoc) {
      addToast(
        'error',
        'Nomor SPO Duplikat',
        `Nomor SPO "${normalizedNumber}" sudah digunakan oleh dokumen "${dupCheck.matchedDoc.title}". Perubahan dibatalkan.`
      );
      return;
    }

    let finalUpdatedSop: SopDocument = {
      ...updatedSop,
      sopNumber: normalizedNumber,
      sequenceNumber: normalizedSequence,
      subHierarchyCode: normalizedHierarchy,
      divisionCode: normalizedDivision,
      divisionName: updatedSop.divisionName,
      categoryName: updatedSop.categoryName,

      // Jangan mengubah lifecycle hanya karena dokumen diedit.
      status: currentSop.status,

      ...(isLegacy
        ? {
            jenis_spo: 'EKSISTING' as const,
            documentType: 'LAMA' as const,
            isLegacySop: true
          }
        : {})
    };

    // Admin yang mengedit SPO AKTIF / DIARSIPKAN hanya memperbaiki
    // isi dokumen. Identitas resmi, status, nomor, revisi dan
    // hubungan workflow tidak boleh berubah.
    if (
      currentSop.status === 'AKTIF' ||
      currentSop.status === 'DIARSIPKAN'
    ) {
      finalUpdatedSop = preserveSopWorkflowIdentity(
        currentSop,
        finalUpdatedSop
      );
    }

    let savedSop: SopDocument;

    try {
      savedSop = await saveSopToLocal(finalUpdatedSop, {
        editActor: userSession
      });

      // Update UI hanya SETELAH penyimpanan authoritative berhasil.
      setSops((prev) =>
        prev.map((s) =>
          s.id === savedSop.id ? savedSop : s
        )
      );

      if (selectedSopForDetail?.id === savedSop.id) {
        setSelectedSopForDetail(savedSop);
      }

      if (selectedSopForEdit?.id === savedSop.id) {
        setSelectedSopForEdit(null);
      }
    } catch (err) {
      console.error(
        'Error updating SOP in local/cloud storage:',
        err
      );

      addToast(
        'error',
        'Perubahan Belum Tersimpan',
        err instanceof Error
          ? err.message
          : 'Dokumen gagal disimpan ke penyimpanan permanen.'
      );

      return;
    }

    addToast(
      'success',
      'Perubahan Disimpan',
      `Dokumen ${savedSop.sopNumber} berhasil diperbarui.`
    );

    const reviewStatus = evaluatePeriodicReview(savedSop);

    if (reviewStatus.isDue) {
      dispatchDocumentEvent(
        'review',
        savedSop,
        `Dokumen ${savedSop.sopNumber}: ${reviewStatus.reason}`
      );
    }
  };

  // Delete SOP Handler (Opens Custom Confirm Modal)
