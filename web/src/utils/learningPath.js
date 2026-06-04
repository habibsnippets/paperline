import { useState, useCallback, useEffect, useRef } from "react";
import { generateLearningPath, generateStudyGuide, generateProjects } from "./hfApi";

export function useLearningPath({ tree, topic, signal }) {
  const [path, setPath] = useState(null);
  const [pathStatus, setPathStatus] = useState("idle");
  const [guides, setGuides] = useState(new Map());
  const [guideStatus, setGuideStatus] = useState(new Map());
  const [readIds, setReadIds] = useState(new Set());
  const [milestoneShown, setMilestoneShown] = useState(false);
  const [projectPath, setProjectPath] = useState(null);
  const [projects, setProjects] = useState(null);
  const [projectStatus, setProjectStatus] = useState("idle");
  const [generatedPath, setGeneratedPath] = useState(null);
  const [generatePathError, setGeneratePathError] = useState(null);
  const milestoneFired = useRef(false);

  const generate = useCallback(async () => {
    if (!tree || !topic) return;
    setPathStatus("loading");
    setGeneratePathError(null);
    try {
      const result = await generateLearningPath(topic, tree, { signal });
      setPath(result);
      setGeneratedPath(result);
      setPathStatus("done");
    } catch (err) {
      setPathStatus("error");
      setGeneratePathError(err.message || "Failed to generate learning path.");
    }
  }, [tree, topic, signal]);

  const generateGuide = useCallback(async (paperId, paper, guideTopic) => {
    if (guides.has(paperId)) return;
    setGuideStatus((prev) => new Map(prev).set(paperId, "loading"));
    try {
      const guide = await generateStudyGuide(paper, guideTopic || topic, { signal });
      setGuides((prev) => new Map(prev).set(paperId, guide));
      setGuideStatus((prev) => new Map(prev).set(paperId, "done"));
    } catch (err) {
      setGuideStatus((prev) => new Map(prev).set(paperId, "error"));
    }
  }, [topic, signal, guides]);

  const toggleRead = useCallback((paperId) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }, []);

  const generateProjectsForPath = useCallback(async (type) => {
    if (!path || path.length === 0) return;
    setMilestoneShown(false);
    setProjectPath(type);
    setProjectStatus("loading");
    try {
      const result = await generateProjects(topic, path, type, { signal });
      setProjects(result);
      setProjectStatus("done");
    } catch (err) {
      setProjectStatus("error");
    }
  }, [path, topic, signal]);

  const reset = useCallback(() => {
    setPath(null);
    setPathStatus("idle");
    setGuides(new Map());
    setGuideStatus(new Map());
    setReadIds(new Set());
    setMilestoneShown(false);
    setProjectPath(null);
    setProjects(null);
    setProjectStatus("idle");
    setGeneratePathError(null);
    milestoneFired.current = false;
  }, []);

  // Milestone detection: >=60% of path papers read
  useEffect(() => {
    if (!path || milestoneShown || projectPath || milestoneFired.current) return;
    const total = path.length;
    if (total === 0) return;
    const read = [...readIds].filter((id) =>
      path.some((p) => p.paper_title === id)
    ).length;
    if (read / total >= 0.6) {
      milestoneFired.current = true;
      setMilestoneShown(true);
    }
  }, [path, readIds, milestoneShown, projectPath]);

  const dismissProjects = useCallback(() => {
    setProjects(null);
    setProjectStatus("idle");
  }, []);

  return {
    path,
    pathStatus,
    generatePathError,
    generate,
    guides,
    guideStatus,
    generateGuide,
    readIds,
    toggleRead,
    milestoneShown,
    setMilestoneShown,
    projectPath,
    setProjectPath,
    projects,
    projectStatus,
    generateProjectsForPath,
    dismissProjects,
    generatedPath,
    reset,
  };
}
