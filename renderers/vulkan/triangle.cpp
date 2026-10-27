// A Vulkan 1.0 frame that clears a swapchain image and draws one triangle.
// This file was written for the work page. It was not compiled here:
// this machine has no Vulkan SDK.
//
// One frame is: acquire an image, record a command buffer, submit it to a
// queue, and present. The GPU waits on the image-available semaphore and
// signals the render-finished semaphore.

#include <vulkan/vulkan.h>

#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

namespace {

void check(VkResult result, const char* step) {
  if (result != VK_SUCCESS) {
    std::cerr << step << " failed: " << result << "\n";
    std::exit(1);
  }
}

VkShaderModule shader_module(VkDevice device, const uint32_t* code, size_t bytes) {
  VkShaderModuleCreateInfo info{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
  info.codeSize = bytes;
  info.pCode = code;
  VkShaderModule module = VK_NULL_HANDLE;
  check(vkCreateShaderModule(device, &info, nullptr, &module), "shader module");
  return module;
}

}  // namespace

int main() {
  VkApplicationInfo app{VK_STRUCTURE_TYPE_APPLICATION_INFO};
  app.pApplicationName = "jonny-triangle";
  app.apiVersion = VK_API_VERSION_1_0;

  const char* instance_extensions[] = {VK_KHR_SURFACE_EXTENSION_NAME};
  VkInstanceCreateInfo instance_info{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
  instance_info.pApplicationInfo = &app;
  instance_info.enabledExtensionCount = 1;
  instance_info.ppEnabledExtensionNames = instance_extensions;

  VkInstance instance = VK_NULL_HANDLE;
  check(vkCreateInstance(&instance_info, nullptr, &instance), "instance");

  uint32_t device_count = 0;
  check(vkEnumeratePhysicalDevices(instance, &device_count, nullptr), "device count");
  std::vector<VkPhysicalDevice> devices(device_count);
  check(vkEnumeratePhysicalDevices(instance, &device_count, devices.data()), "devices");
  VkPhysicalDevice physical = devices[0];

  uint32_t family_count = 0;
  vkGetPhysicalDeviceQueueFamilyProperties(physical, &family_count, nullptr);
  std::vector<VkQueueFamilyProperties> families(family_count);
  vkGetPhysicalDeviceQueueFamilyProperties(physical, &family_count, families.data());
  uint32_t graphics_family = 0;
  for (uint32_t i = 0; i < family_count; ++i) {
    if (families[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) {
      graphics_family = i;
      break;
    }
  }

  float priority = 1.f;
  VkDeviceQueueCreateInfo queue_info{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
  queue_info.queueFamilyIndex = graphics_family;
  queue_info.queueCount = 1;
  queue_info.pQueuePriorities = &priority;
  const char* device_extensions[] = {VK_KHR_SWAPCHAIN_EXTENSION_NAME};
  VkDeviceCreateInfo device_info{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
  device_info.queueCreateInfoCount = 1;
  device_info.pQueueCreateInfos = &queue_info;
  device_info.enabledExtensionCount = 1;
  device_info.ppEnabledExtensionNames = device_extensions;
  VkDevice device = VK_NULL_HANDLE;
  check(vkCreateDevice(physical, &device_info, nullptr, &device), "device");

  VkQueue queue = VK_NULL_HANDLE;
  vkGetDeviceQueue(device, graphics_family, 0, &queue);

  // A window surface and swapchain are created by the platform layer.
  // The rest of the frame does not care which image it was given.
  VkSurfaceKHR surface = VK_NULL_HANDLE;
  VkSwapchainKHR swapchain = VK_NULL_HANDLE;
  VkFormat format = VK_FORMAT_B8G8R8A8_UNORM;
  VkExtent2D extent{960, 540};

  VkAttachmentDescription color{};
  color.format = format;
  color.samples = VK_SAMPLE_COUNT_1_BIT;
  color.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
  color.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
  color.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
  color.finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
  VkAttachmentReference color_ref{0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL};
  VkSubpassDescription subpass{};
  subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
  subpass.colorAttachmentCount = 1;
  subpass.pColorAttachments = &color_ref;
  VkRenderPassCreateInfo pass_info{VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO};
  pass_info.attachmentCount = 1;
  pass_info.pAttachments = &color;
  pass_info.subpassCount = 1;
  pass_info.pSubpasses = &subpass;
  VkRenderPass render_pass = VK_NULL_HANDLE;
  check(vkCreateRenderPass(device, &pass_info, nullptr, &render_pass), "render pass");

  VkPipelineLayout pipeline_layout = VK_NULL_HANDLE;
  VkPipelineLayoutCreateInfo layout_info{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
  check(vkCreatePipelineLayout(device, &layout_info, nullptr, &pipeline_layout), "layout");

  // SPIR-V for a clip-space triangle would be supplied here.
  const uint32_t vertex_spirv[] = {0x07230203};
  const uint32_t fragment_spirv[] = {0x07230203};
  VkShaderModule vertex = shader_module(device, vertex_spirv, sizeof vertex_spirv);
  VkShaderModule fragment = shader_module(device, fragment_spirv, sizeof fragment_spirv);
  VkPipelineShaderStageCreateInfo stages[2]{};
  stages[0].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
  stages[0].stage = VK_SHADER_STAGE_VERTEX_BIT;
  stages[0].module = vertex;
  stages[0].pName = "main";
  stages[1].sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
  stages[1].stage = VK_SHADER_STAGE_FRAGMENT_BIT;
  stages[1].module = fragment;
  stages[1].pName = "main";

  VkPipelineVertexInputStateCreateInfo vertex_input{VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO};
  VkPipelineInputAssemblyStateCreateInfo assembly{VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO};
  assembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
  VkViewport viewport{0, 0, float(extent.width), float(extent.height), 0.f, 1.f};
  VkRect2D scissor{{0, 0}, extent};
  VkPipelineViewportStateCreateInfo viewport_state{VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO};
  viewport_state.viewportCount = 1;
  viewport_state.pViewports = &viewport;
  viewport_state.scissorCount = 1;
  viewport_state.pScissors = &scissor;
  VkPipelineRasterizationStateCreateInfo raster{VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO};
  raster.polygonMode = VK_POLYGON_MODE_FILL;
  raster.cullMode = VK_CULL_MODE_NONE;
  raster.frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE;
  raster.lineWidth = 1.f;
  VkPipelineMultisampleStateCreateInfo multisample{VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO};
  multisample.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;
  VkPipelineColorBlendAttachmentState blend{};
  blend.colorWriteMask = 0xF;
  VkPipelineColorBlendStateCreateInfo blending{VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO};
  blending.attachmentCount = 1;
  blending.pAttachments = &blend;
  VkGraphicsPipelineCreateInfo pipeline_info{VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO};
  pipeline_info.stageCount = 2;
  pipeline_info.pStages = stages;
  pipeline_info.pVertexInputState = &vertex_input;
  pipeline_info.pInputAssemblyState = &assembly;
  pipeline_info.pViewportState = &viewport_state;
  pipeline_info.pRasterizationState = &raster;
  pipeline_info.pMultisampleState = &multisample;
  pipeline_info.pColorBlendState = &blending;
  pipeline_info.layout = pipeline_layout;
  pipeline_info.renderPass = render_pass;
  VkPipeline pipeline = VK_NULL_HANDLE;
  check(vkCreateGraphicsPipelines(device, VK_NULL_HANDLE, 1, &pipeline_info, nullptr, &pipeline), "pipeline");

  VkSemaphore image_available = VK_NULL_HANDLE;
  VkSemaphore render_finished = VK_NULL_HANDLE;
  VkSemaphoreCreateInfo semaphore_info{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
  check(vkCreateSemaphore(device, &semaphore_info, nullptr, &image_available), "semaphore");
  check(vkCreateSemaphore(device, &semaphore_info, nullptr, &render_finished), "semaphore");
  VkCommandPool command_pool = VK_NULL_HANDLE;
  VkCommandPoolCreateInfo pool_info{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
  pool_info.queueFamilyIndex = graphics_family;
  check(vkCreateCommandPool(device, &pool_info, nullptr, &command_pool), "command pool");

  uint32_t image_index = 0;
  check(vkAcquireNextImageKHR(device, swapchain, UINT64_MAX, image_available, VK_NULL_HANDLE, &image_index), "acquire");

  VkCommandBuffer commands = VK_NULL_HANDLE;
  VkCommandBufferAllocateInfo alloc{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
  alloc.commandPool = command_pool;
  alloc.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
  alloc.commandBufferCount = 1;
  check(vkAllocateCommandBuffers(device, &alloc, &commands), "allocate");
  VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
  begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
  check(vkBeginCommandBuffer(commands, &begin), "begin");
  VkClearValue clear{};
  clear.color = {{0.10f, 0.16f, 0.24f, 1.f}};
  VkRenderPassBeginInfo render_begin{VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO};
  render_begin.renderPass = render_pass;
  render_begin.renderArea.extent = extent;
  render_begin.clearValueCount = 1;
  render_begin.pClearValues = &clear;
  vkCmdBeginRenderPass(commands, &render_begin, VK_SUBPASS_CONTENTS_INLINE);
  vkCmdBindPipeline(commands, VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline);
  vkCmdDraw(commands, 3, 1, 0, 0);
  vkCmdEndRenderPass(commands);
  check(vkEndCommandBuffer(commands), "end");

  VkPipelineStageFlags wait_stage = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
  VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO};
  submit.waitSemaphoreCount = 1;
  submit.pWaitSemaphores = &image_available;
  submit.pWaitDstStageMask = &wait_stage;
  submit.commandBufferCount = 1;
  submit.pCommandBuffers = &commands;
  submit.signalSemaphoreCount = 1;
  submit.pSignalSemaphores = &render_finished;
  check(vkQueueSubmit(queue, 1, &submit, VK_NULL_HANDLE), "submit");

  VkPresentInfoKHR present{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR};
  present.waitSemaphoreCount = 1;
  present.pWaitSemaphores = &render_finished;
  present.swapchainCount = 1;
  present.pSwapchains = &swapchain;
  present.pImageIndices = &image_index;
  check(vkQueuePresentKHR(queue, &present), "present");
  check(vkQueueWaitIdle(queue), "idle");

  vkDestroySemaphore(device, image_available, nullptr);
  vkDestroySemaphore(device, render_finished, nullptr);
  vkDestroyCommandPool(device, command_pool, nullptr);
  vkDestroyPipeline(device, pipeline, nullptr);
  vkDestroyShaderModule(device, vertex, nullptr);
  vkDestroyShaderModule(device, fragment, nullptr);
  vkDestroyPipelineLayout(device, pipeline_layout, nullptr);
  vkDestroyRenderPass(device, render_pass, nullptr);
  vkDestroySwapchainKHR(device, swapchain, nullptr);
  vkDestroyDevice(device, nullptr);
  vkDestroySurfaceKHR(instance, surface, nullptr);
  vkDestroyInstance(instance, nullptr);
  return 0;
}
