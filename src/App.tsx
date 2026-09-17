    // Admin editing an active/archived SPO is only correcting its content.
    // Official identity, lifecycle and workflow relationships must remain unchanged.
    if (currentSop.status === 'AKTIF' || currentSop.status === 'DIARSIPKAN') {
      finalUpdatedSop = preserveSopWorkflowIdentity(currentSop, finalUpdatedSop);
    }

    let savedSop: SopDocument;

    try {
      savedSop = await saveSopToLocal(finalUpdatedSop, {
        editActor: userSession
      });

      setSops((prev) =>
        prev.map((s) => (s.id === savedSop.id ? savedSop : s))
      );

      if (selectedSopForDetail?.id === savedSop.id) {
        setSelectedSopForDetail(savedSop);
      }
    } catch (err) {
      console.error('Error updating SOP in local/cloud storage:', err);
      addToast(
        'error',
        'Perubahan Belum Tersimpan',
        err instanceof Error
          ? err.message
          : 'Dokumen gagal disimpan ke penyimpanan permanen.'
      );
      return;
    }

    await logAuditToFirestore({
      action: 'SPO_EDIT',
      actorName: userSession.name || userSession.username,
      actorRole: userSession.role,
      details: `SPO ${savedSop.id} (${savedSop.sopNumber}) diedit; status ${currentSop.status}.`,
    });

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