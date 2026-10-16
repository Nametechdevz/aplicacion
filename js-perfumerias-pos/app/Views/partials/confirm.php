<dialog class="modal modal-sm" id="confirm-dialog" aria-labelledby="confirm-title">
  <form method="dialog" class="modal-card">
    <div class="modal-head">
      <div>
        <h2 id="confirm-title">¿Confirmar acción?</h2>
        <p data-confirm-text>Esta operación no se puede deshacer.</p>
      </div>
    </div>
    <div class="modal-body hidden" data-confirm-reason-wrap>
      <div class="field">
        <label for="confirm-reason" data-confirm-reason-label>Motivo</label>
        <textarea class="textarea" id="confirm-reason" rows="3" data-confirm-reason></textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" value="cancel" type="submit">Cancelar</button>
      <button class="btn btn-primary" value="ok" type="submit" data-confirm-ok>Confirmar</button>
    </div>
  </form>
</dialog>
