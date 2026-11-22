import { Folder, FolderOpen, FolderPlus, GitBranch, X } from 'lucide-react'
import type { Project } from '@shared/types'
import { useStore, actions, safe } from '../lib/store'
import { invoke } from '../lib/api'
import { useT } from '../lib/i18n'

/** Asks which project a project-less conversation should move into (used by "Apply to file"). */
export function ProjectPicker() {
  const t = useT()
  const projects = useStore((s) => s.projects)
  const pickNew = async (create: boolean) => {
    const p = await safe(invoke<Project | null>(create ? 'projects:createDialog' : 'projects:openDialog'))
    if (p) actions.resolveProjectPicker(p.id)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-8" onClick={() => actions.resolveProjectPicker(null)}>
      <div className="w-[520px] max-h-[70vh] card shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-label={t('Choose a project for this conversation')} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <div className="flex items-center"><span className="text-[15px] font-medium">{t('Choose a project for this conversation')}</span><button className="icon-btn ml-auto" aria-label={t('close')} onClick={() => actions.resolveProjectPicker(null)}><X size={14} /></button></div>
          <p className="text-[12.5px] text-fg2 mt-1">{t('To apply code to a file, PTR AI needs a project folder. The conversation will move into the project you choose.')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {projects.filter((p) => !p.missing).map((p) => (
            <button key={p.id} onClick={() => actions.resolveProjectPicker(p.id)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-bg3 flex items-center gap-3">
              {p.isGit ? <GitBranch size={15} className="text-fg2" /> : <Folder size={15} className="text-fg2" />}
              <div className="min-w-0"><div className="text-[13.5px]">{p.name}</div><div className="text-2xs mono text-fg3 truncate">{p.path}</div></div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-line flex gap-2">
          <button className="btn-outline h-8" onClick={() => pickNew(false)}><FolderOpen size={13} />{t('Open another folder…')}</button>
          <button className="btn-outline h-8" onClick={() => pickNew(true)}><FolderPlus size={13} />{t('Create a new folder…')}</button>
        </div>
      </div>
    </div>
  )
}
